-- =========================================================
-- LEDGER GOVERNANCE FINAL HARDENING LAYER
-- =========================================================

-- 1) FULL COVERAGE CONTRACT AUDIT
CREATE OR REPLACE FUNCTION public.audit_contract_coverage()
RETURNS TABLE(
  event_type TEXT,
  missing_debit BOOLEAN,
  missing_credit BOOLEAN,
  orphan_event BOOLEAN
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
    NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts coa
      WHERE coa.code = c.debit_account_code
    ) AS missing_debit,
    NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts coa
      WHERE coa.code = c.credit_account_code
    ) AS missing_credit,
    (c.debit_account_code IS NULL OR c.credit_account_code IS NULL) AS orphan_event
  FROM public.financial_event_contract c
  WHERE c.is_active = true;
END $$;

-- 2) STRICT SYSTEM LOCK
CREATE OR REPLACE FUNCTION public.assert_system_zero_gap()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v
  FROM public.audit_contract_coverage()
  WHERE missing_debit OR missing_credit OR orphan_event;
  IF v > 0 THEN
    RAISE EXCEPTION 'SYSTEM NOT SAFE: % contract gaps detected', v;
  END IF;
END $$;

SELECT public.assert_system_zero_gap();

-- 3) BLOCK MANUAL INSERTS — engine bypass via session GUC
CREATE OR REPLACE FUNCTION public.block_manual_ledger_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.ledger_engine_bypass', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DIRECT LEDGER INSERT BLOCKED — ENGINE ONLY MODE ACTIVE';
END $$;

DROP TRIGGER IF EXISTS trg_block_manual_insert ON public.double_entry_ledger;

CREATE TRIGGER trg_block_manual_insert
BEFORE INSERT ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.block_manual_ledger_insert();

-- Patch engine to set bypass — preserve EXACT signature & return type
CREATE OR REPLACE FUNCTION public.post_financial_event(
  p_tenant_id uuid,
  p_event_type text,
  p_amount numeric,
  p_reference_id uuid,
  p_reference_type text DEFAULT NULL::text,
  p_narration text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dr_id UUID;
  v_cr_id UUID;
  v_dr_type TEXT;
  v_cr_type TEXT;
  v_ref_type TEXT;
  v_actor UUID;
BEGIN
  -- Engine bypass for trigger lock (session-local, auto-resets at txn end)
  PERFORM set_config('app.ledger_engine_bypass', 'on', true);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'TLIS: invalid amount %', p_amount;
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: reference_id required for idempotency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_reference_id::text || ':' || p_event_type));

  SELECT debit_account_id, credit_account_id
  INTO v_dr_id, v_cr_id
  FROM public.resolve_event_accounts(p_tenant_id, p_event_type);

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: COA mapping missing for tenant=% event=%', p_tenant_id, p_event_type;
  END IF;

  SELECT account_type INTO v_dr_type FROM public.chart_of_accounts WHERE id = v_dr_id;
  SELECT account_type INTO v_cr_type FROM public.chart_of_accounts WHERE id = v_cr_id;

  v_ref_type := COALESCE(p_reference_type, lower(p_event_type));
  v_actor := COALESCE(p_created_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  )
  VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_dr_type, v_dr_id,
    v_dr_id, p_amount, 0, 0, p_narration, p_event_type, v_actor
  )
  ON CONFLICT ON CONSTRAINT idx_del_idempotent DO NOTHING;

  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  )
  VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_cr_type, v_cr_id,
    v_cr_id, 0, p_amount, 0, p_narration, p_event_type, v_actor
  )
  ON CONFLICT ON CONSTRAINT idx_del_idempotent DO NOTHING;
END $function$;

-- 4) FORENSIC TRACE COLUMN
ALTER TABLE public.double_entry_ledger
ADD COLUMN IF NOT EXISTS trace_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_ledger_trace_hash
ON public.double_entry_ledger(trace_hash);

-- 5) FINAL STATE MACHINE
CREATE OR REPLACE FUNCTION public.ledger_final_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract INT;
  v_unbalanced INT;
  v_blocked INT;
BEGIN
  SELECT COUNT(*) INTO v_contract
  FROM public.audit_contract_coverage()
  WHERE missing_debit OR missing_credit;

  -- Per-reference balance check: total debits must equal total credits
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT reference_id
    FROM public.double_entry_ledger
    WHERE reference_id IS NOT NULL
    GROUP BY reference_id, event_type
    HAVING SUM(COALESCE(debit,0)) <> SUM(COALESCE(credit,0))
  ) t;

  SELECT COUNT(*) INTO v_blocked
  FROM pg_trigger
  WHERE tgname = 'trg_block_manual_insert';

  RETURN jsonb_build_object(
    'status',
    CASE
      WHEN v_contract = 0 AND v_unbalanced = 0 THEN 'ULTRA_SAFE'
      ELSE 'BROKEN'
    END,
    'contract_gaps', v_contract,
    'unbalanced_groups', v_unbalanced,
    'manual_insert_block_active', (v_blocked > 0),
    'checked_at', now()
  );
END $$;

-- 6) PERMISSIONS LOCKDOWN
REVOKE ALL ON FUNCTION public.block_manual_ledger_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_contract_coverage() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_final_state() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_system_zero_gap() TO authenticated, service_role;