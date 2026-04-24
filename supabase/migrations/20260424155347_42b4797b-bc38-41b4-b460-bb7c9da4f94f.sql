/* =========================================================
   BANK-GRADE LEDGER — FINAL STABILIZATION LAYER (v4)
   Schema-aligned, gap-free, portable
   ========================================================= */

-- ---------------------------------------------------------
-- 1) REAL-TIME LEDGER RECONCILIATION (per tenant)
-- Uses actual schema: debit/credit columns (two-leg rows)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_ledger_reconciliation()
RETURNS TABLE(
  tenant_id UUID,
  total_debit NUMERIC,
  total_credit NUMERIC,
  variance NUMERIC,
  balance_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.tenant_id,
    COALESCE(SUM(l.debit), 0)  AS total_debit,
    COALESCE(SUM(l.credit), 0) AS total_credit,
    COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS variance,
    CASE
      WHEN COALESCE(SUM(l.debit), 0) = COALESCE(SUM(l.credit), 0)
        THEN 'BALANCED'
      ELSE 'IMBALANCED'
    END AS balance_status
  FROM public.double_entry_ledger l
  WHERE COALESCE(l.is_reversed, false) = false
  GROUP BY l.tenant_id;
END $$;

-- ---------------------------------------------------------
-- 2) HISTORICAL BACKFILL ENGINE
-- Maps transactions.type (enum) → financial_event_contract.event_type
-- Derives tenant_id via client_id (transactions has no tenant_id)
-- Skips entries already posted (reference_id idempotency)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_ledger_from_transactions(
  p_dry_run BOOLEAN DEFAULT true,
  p_limit INT DEFAULT 1000
)
RETURNS TABLE(
  scanned INT,
  posted INT,
  skipped INT,
  failed INT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_tenant UUID;
  v_event TEXT;
  v_ref_uuid UUID;
  v_scanned INT := 0;
  v_posted  INT := 0;
  v_skipped INT := 0;
  v_failed  INT := 0;
  v_errors  JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT t.*
    FROM public.transactions t
    WHERE t.deleted_at IS NULL
      AND t.status::text IN ('completed', 'approved', 'success')
    ORDER BY t.created_at ASC
    LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;

    -- Map enum → contract event_type
    v_event := CASE t.type::text
      WHEN 'loan_disbursement'   THEN 'LOAN_DISBURSE'
      WHEN 'loan_repayment'      THEN 'LOAN_REPAYMENT'
      WHEN 'savings_deposit'     THEN 'DPS_DEPOSIT'
      WHEN 'savings_withdrawal'  THEN 'DPS_WITHDRAW'
      ELSE NULL
    END
    FROM (SELECT r.type) t;

    IF v_event IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Derive tenant
    SELECT c.tenant_id INTO v_tenant
    FROM public.clients c
    WHERE c.id = r.client_id;

    IF v_tenant IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Cast text reference_id → UUID safely
    BEGIN
      v_ref_uuid := r.id;  -- use transaction id as canonical reference
    EXCEPTION WHEN others THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    -- Idempotency: skip if already posted
    IF EXISTS (
      SELECT 1 FROM public.double_entry_ledger l
      WHERE l.reference_id = v_ref_uuid
        AND l.event_type = v_event
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_posted := v_posted + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.post_financial_event(
        v_tenant,
        v_event,
        r.amount,
        v_ref_uuid,
        'backfill'::text,
        COALESCE(r.notes, 'Historical backfill'),
        r.performed_by
      );
      v_posted := v_posted + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'transaction_id', r.id,
        'event', v_event,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN QUERY SELECT v_scanned, v_posted, v_skipped, v_failed, v_errors;
END $$;

-- ---------------------------------------------------------
-- 3) GAP DETECTION ENGINE (contract integrity)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_financial_gaps()
RETURNS TABLE(
  event_type TEXT,
  issue TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.event_type,
    CASE
      WHEN c.debit_account_code IS NULL THEN 'MISSING_DEBIT'
      WHEN c.credit_account_code IS NULL THEN 'MISSING_CREDIT'
      WHEN c.debit_account_code = c.credit_account_code THEN 'SELF_POSTING'
      ELSE 'OK'
    END AS issue
  FROM public.financial_event_contract c
  WHERE c.is_active = true
    AND (
      c.debit_account_code IS NULL
      OR c.credit_account_code IS NULL
      OR c.debit_account_code = c.credit_account_code
    );
END $$;

-- ---------------------------------------------------------
-- 4) FRAUD / ANOMALY DETECTION LAYER
-- Two-leg rows = exactly 2 expected per reference; >2 = duplicate
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_ledger_anomalies()
RETURNS TABLE(
  reference_id UUID,
  event_type TEXT,
  leg_count BIGINT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  issue TEXT,
  severity TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.reference_id,
    l.event_type,
    COUNT(*) AS leg_count,
    COALESCE(SUM(l.debit), 0)  AS total_debit,
    COALESCE(SUM(l.credit), 0) AS total_credit,
    CASE
      WHEN COUNT(*) > 2 THEN 'DUPLICATE_POSTING'
      WHEN COUNT(*) < 2 THEN 'INCOMPLETE_POSTING'
      WHEN COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0) THEN 'UNBALANCED_ENTRY'
      WHEN COALESCE(SUM(l.debit), 0) = 0 THEN 'ZERO_AMOUNT'
      ELSE 'OK'
    END AS issue,
    'HIGH'::TEXT AS severity
  FROM public.double_entry_ledger l
  WHERE l.reference_id IS NOT NULL
    AND COALESCE(l.is_reversed, false) = false
  GROUP BY l.reference_id, l.event_type
  HAVING
    COUNT(*) <> 2
    OR COALESCE(SUM(l.debit), 0) <> COALESCE(SUM(l.credit), 0)
    OR COALESCE(SUM(l.debit), 0) = 0;
END $$;

-- ---------------------------------------------------------
-- 5) AUTO-HEALTH CHECK (system status JSON)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_system_health_check()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imbalanced INT;
  v_gaps INT;
  v_anomalies INT;
  v_total_tenants INT;
BEGIN
  SELECT COUNT(*) INTO v_imbalanced
  FROM public.run_ledger_reconciliation()
  WHERE balance_status = 'IMBALANCED';

  SELECT COUNT(*) INTO v_gaps
  FROM public.detect_financial_gaps();

  SELECT COUNT(*) INTO v_anomalies
  FROM public.detect_ledger_anomalies();

  SELECT COUNT(*) INTO v_total_tenants
  FROM public.run_ledger_reconciliation();

  RETURN jsonb_build_object(
    'checked_at', now(),
    'tenants_checked', v_total_tenants,
    'imbalanced_tenants', v_imbalanced,
    'contract_gaps', v_gaps,
    'ledger_anomalies', v_anomalies,
    'status', CASE
      WHEN v_imbalanced = 0 AND v_gaps = 0 AND v_anomalies = 0 THEN 'HEALTHY'
      WHEN v_imbalanced > 0 OR v_gaps > 0 THEN 'CRITICAL'
      ELSE 'DEGRADED'
    END
  );
END $$;

-- ---------------------------------------------------------
-- 6) EXECUTION SAFETY LOCK (idempotent reinforcement)
-- ---------------------------------------------------------
REVOKE INSERT ON public.double_entry_ledger FROM PUBLIC;
REVOKE INSERT ON public.double_entry_ledger FROM anon;
REVOKE INSERT ON public.double_entry_ledger FROM authenticated;

-- ---------------------------------------------------------
-- 7) GRANTS — read-only diagnostics for app, full for service
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.run_ledger_reconciliation()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_financial_gaps()             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_ledger_anomalies()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_system_health_check()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backfill_ledger_from_transactions(BOOLEAN, INT) TO service_role;
