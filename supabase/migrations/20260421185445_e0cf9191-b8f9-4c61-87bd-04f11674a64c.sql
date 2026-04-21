-- =============================================================================
-- RESERVE ARCHITECTURE v2 — CENTRAL BANK GRADE FINANCIAL SYSTEM
-- =============================================================================

-- 1. IMMUTABLE LEDGER (APPEND-ONLY ENFORCEMENT)
ALTER TABLE public.double_entry_ledger
  ADD COLUMN IF NOT EXISTS root_reference_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS is_reversed boolean DEFAULT false;

-- HARD IMMUTABILITY (NO UPDATE / DELETE EVER)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_update_ledger'
      AND polrelid = 'public.double_entry_ledger'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_update_ledger" ON public.double_entry_ledger AS RESTRICTIVE FOR UPDATE USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_delete_ledger'
      AND polrelid = 'public.double_entry_ledger'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_delete_ledger" ON public.double_entry_ledger AS RESTRICTIVE FOR DELETE USING (false)';
  END IF;
END $$;

-- 2. FINANCIAL EVENT LOG (SOURCE OF TRUTH)
CREATE TABLE IF NOT EXISTS public.financial_event_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    root_reference_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_event_tenant ON public.financial_event_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_event_root ON public.financial_event_log(root_reference_id);

ALTER TABLE public.financial_event_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_read_events'
      AND polrelid = 'public.financial_event_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "tenant_read_events" ON public.financial_event_log FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_direct_event_insert'
      AND polrelid = 'public.financial_event_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_direct_event_insert" ON public.financial_event_log AS RESTRICTIVE FOR INSERT WITH CHECK (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_direct_event_update'
      AND polrelid = 'public.financial_event_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_direct_event_update" ON public.financial_event_log AS RESTRICTIVE FOR UPDATE USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_direct_event_delete'
      AND polrelid = 'public.financial_event_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_direct_event_delete" ON public.financial_event_log AS RESTRICTIVE FOR DELETE USING (false)';
  END IF;
END $$;

-- 3. CENTRAL POSTING CORE (DOUBLE ENTRY EVENT)
CREATE OR REPLACE FUNCTION public.post_double_entry_event(
    p_tenant_id uuid,
    p_event_type text,
    p_ref uuid,
    p_debit_account uuid,
    p_credit_account uuid,
    p_amount numeric,
    p_meta jsonb DEFAULT '{}'::jsonb,
    p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_debit_type  text;
    v_credit_type text;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'post_double_entry_event: amount must be > 0';
    END IF;

    SELECT account_type::text INTO v_debit_type
    FROM public.accounts WHERE id = p_debit_account;

    SELECT account_type::text INTO v_credit_type
    FROM public.accounts WHERE id = p_credit_account;

    IF v_debit_type IS NULL OR v_credit_type IS NULL THEN
        RAISE EXCEPTION 'post_double_entry_event: account not found (debit=%, credit=%)', p_debit_account, p_credit_account;
    END IF;

    -- EVENT LOG FIRST (BEFORE LEDGER) — bypasses RESTRICTIVE policy via SECURITY DEFINER
    INSERT INTO public.financial_event_log(
        tenant_id, event_type, root_reference_id, payload, created_by
    )
    VALUES (p_tenant_id, p_event_type, p_ref, COALESCE(p_meta, '{}'::jsonb), p_actor);

    -- DOUBLE ENTRY POSTING (APPEND ONLY)
    INSERT INTO public.double_entry_ledger (
        tenant_id, account_id, account_type, debit, credit,
        reference_id, reference_type, root_reference_id, event_type,
        created_by, created_at
    )
    VALUES
    (p_tenant_id, p_debit_account, v_debit_type, p_amount, 0,
     p_ref::text, p_event_type, p_ref, p_event_type, p_actor, now()),
    (p_tenant_id, p_credit_account, v_credit_type, 0, p_amount,
     p_ref::text, p_event_type, p_ref, p_event_type, p_actor, now());
END;
$$;

-- 4. BALANCE SNAPSHOT v2 (READ OPTIMIZATION ONLY)
CREATE TABLE IF NOT EXISTS public.account_balance_snapshot_v2 (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_time timestamp with time zone DEFAULT now(),
    snapshot_date date DEFAULT CURRENT_DATE,
    account_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    balance numeric NOT NULL,
    version bigint DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_snapshot_v2_date ON public.account_balance_snapshot_v2(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshot_v2_account ON public.account_balance_snapshot_v2(account_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_v2_tenant ON public.account_balance_snapshot_v2(tenant_id, snapshot_date);

ALTER TABLE public.account_balance_snapshot_v2 ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_read_snapshot_v2'
      AND polrelid = 'public.account_balance_snapshot_v2'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "tenant_read_snapshot_v2" ON public.account_balance_snapshot_v2 FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_snapshot_v2_update'
      AND polrelid = 'public.account_balance_snapshot_v2'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_snapshot_v2_update" ON public.account_balance_snapshot_v2 AS RESTRICTIVE FOR UPDATE USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_snapshot_v2_delete'
      AND polrelid = 'public.account_balance_snapshot_v2'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_snapshot_v2_delete" ON public.account_balance_snapshot_v2 AS RESTRICTIVE FOR DELETE USING (false)';
  END IF;
END $$;

-- 5. SNAPSHOT GENERATOR v2 (APPEND ONLY)
CREATE OR REPLACE FUNCTION public.rpc_generate_snapshot_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.account_balance_snapshot_v2(
        snapshot_date, account_id, tenant_id, balance, version
    )
    SELECT
        CURRENT_DATE,
        account_id,
        tenant_id,
        SUM(debit - credit),
        EXTRACT(EPOCH FROM now())::bigint
    FROM public.double_entry_ledger
    GROUP BY account_id, tenant_id;
END;
$$;

-- 6. FRAUD / ANOMALY LOG
CREATE TABLE IF NOT EXISTS public.financial_anomaly_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid,
    anomaly_type text,
    severity text,
    reference_id text,
    detected_value numeric,
    threshold_value numeric,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_log_created ON public.financial_anomaly_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_log_tenant ON public.financial_anomaly_log(tenant_id, created_at DESC);

ALTER TABLE public.financial_anomaly_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'tenant_read_anomaly'
      AND polrelid = 'public.financial_anomaly_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "tenant_read_anomaly" ON public.financial_anomaly_log FOR SELECT TO authenticated USING (tenant_id IS NULL OR tenant_id = public.get_user_tenant_id())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_anomaly_insert'
      AND polrelid = 'public.financial_anomaly_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_anomaly_insert" ON public.financial_anomaly_log AS RESTRICTIVE FOR INSERT WITH CHECK (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_anomaly_update'
      AND polrelid = 'public.financial_anomaly_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_anomaly_update" ON public.financial_anomaly_log AS RESTRICTIVE FOR UPDATE USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'block_anomaly_delete'
      AND polrelid = 'public.financial_anomaly_log'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "block_anomaly_delete" ON public.financial_anomaly_log AS RESTRICTIVE FOR DELETE USING (false)';
  END IF;
END $$;

-- 7. RECONCILIATION CHECKER (FEEDS ANOMALY LOG)
CREATE OR REPLACE FUNCTION public.rpc_reconcile_ledger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_imbalance_count int;
BEGIN
    WITH imbalanced AS (
        SELECT
            reference_id,
            SUM(debit - credit) AS diff
        FROM public.double_entry_ledger
        WHERE reference_id IS NOT NULL
        GROUP BY reference_id
        HAVING SUM(debit) <> SUM(credit)
    ),
    inserted AS (
        INSERT INTO public.financial_anomaly_log
            (anomaly_type, severity, reference_id, detected_value, threshold_value)
        SELECT 'LEDGER_IMBALANCE', 'CRITICAL', reference_id, diff, 0
        FROM imbalanced
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_imbalance_count FROM inserted;

    RETURN jsonb_build_object(
        'reconciliation_status', CASE WHEN v_imbalance_count = 0 THEN 'CLEAN' ELSE 'IMBALANCED' END,
        'issue_count', v_imbalance_count,
        'checked_at', now()
    );
END;
$$;

-- 8. DAILY AUTOMATION (IDEMPOTENT pg_cron)
DO $$
BEGIN
  PERFORM cron.unschedule('v2_snapshot_engine');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('v2_reconciliation_check');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule('v2_snapshot_engine', '55 23 * * *', 'SELECT public.rpc_generate_snapshot_v2();');
SELECT cron.schedule('v2_reconciliation_check', '58 23 * * *', 'SELECT public.rpc_reconcile_ledger();');