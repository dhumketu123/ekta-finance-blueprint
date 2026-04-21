-- =============================================================================
-- RESERVE ARCHITECTURE v1.1 (BANK-GRADE HARDENING PATCH)
-- =============================================================================

-- 1. SINGLE SOURCE OF TRUTH ENFORCEMENT
CREATE OR REPLACE VIEW public.v_account_balance AS
SELECT
    account_id,
    tenant_id,
    SUM(debit - credit) AS balance
FROM public.double_entry_ledger
GROUP BY account_id, tenant_id;

COMMENT ON VIEW public.v_account_balance IS 'Single Source of Truth for all financial balances.';

-- 2. PROVISION RATE GOVERNANCE
ALTER TABLE public.loan_products
ADD COLUMN IF NOT EXISTS provision_rate numeric DEFAULT 5 CHECK (provision_rate BETWEEN 0 AND 100);

-- 3. SNAPSHOT LAYER (PERFORMANCE + CONSISTENCY)
CREATE TABLE IF NOT EXISTS public.daily_balance_snapshot (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_date date NOT NULL,
    account_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    balance numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(snapshot_date, account_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_balance_snapshot_date ON public.daily_balance_snapshot(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_daily_balance_snapshot_account ON public.daily_balance_snapshot(account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_balance_snapshot_tenant ON public.daily_balance_snapshot(tenant_id, snapshot_date DESC);

ALTER TABLE public.daily_balance_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant read snapshots" ON public.daily_balance_snapshot;
CREATE POLICY "Tenant read snapshots"
ON public.daily_balance_snapshot
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "Block direct snapshot writes" ON public.daily_balance_snapshot;
CREATE POLICY "Block direct snapshot writes"
ON public.daily_balance_snapshot
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 4. DAILY SNAPSHOT FUNCTION
CREATE OR REPLACE FUNCTION public.rpc_generate_daily_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.daily_balance_snapshot (
        snapshot_date,
        account_id,
        tenant_id,
        balance
    )
    SELECT
        CURRENT_DATE,
        account_id,
        tenant_id,
        SUM(debit - credit)
    FROM public.double_entry_ledger
    GROUP BY account_id, tenant_id
    ON CONFLICT (snapshot_date, account_id, tenant_id)
    DO UPDATE SET balance = EXCLUDED.balance, created_at = now();
END;
$$;

-- 5. ENHANCED LIQUIDITY ENGINE (SNAPSHOT BASED)
CREATE OR REPLACE FUNCTION public.rpc_calculate_daily_liquidity_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cash numeric := 0;
    v_bank numeric := 0;
    v_savings numeric := 0;
    v_ratio numeric;
BEGIN
    -- Fetch Cash
    SELECT COALESCE(SUM(balance),0) INTO v_cash
    FROM public.daily_balance_snapshot
    WHERE account_id IN (SELECT id FROM public.accounts WHERE account_code='CASH_ON_HAND')
      AND snapshot_date = CURRENT_DATE;

    -- Fetch Bank
    SELECT COALESCE(SUM(balance),0) INTO v_bank
    FROM public.daily_balance_snapshot
    WHERE account_id IN (SELECT id FROM public.accounts WHERE account_code='BANK_ACCOUNT')
      AND snapshot_date = CURRENT_DATE;

    -- Fetch Savings Liability (Polarity reverse: liability natural balance is credit)
    SELECT COALESCE(SUM(balance * -1),0) INTO v_savings
    FROM public.daily_balance_snapshot
    WHERE account_id IN (SELECT id FROM public.accounts WHERE account_code='SAVINGS_LIABILITY')
      AND snapshot_date = CURRENT_DATE;

    v_ratio := CASE WHEN v_savings > 0 THEN ROUND((v_cash + v_bank) / v_savings, 4) ELSE NULL END;

    -- Log to daily_financial_summary
    INSERT INTO public.daily_financial_summary (summary_date, liquidity_ratio, updated_at)
    VALUES (CURRENT_DATE, v_ratio, now())
    ON CONFLICT (summary_date) DO UPDATE
    SET liquidity_ratio = EXCLUDED.liquidity_ratio, updated_at = now();

    RETURN jsonb_build_object(
        'cash', v_cash,
        'bank', v_bank,
        'savings', v_savings,
        'liquidity_ratio', v_ratio,
        'computed_at', now()
    );
END;
$$;

-- 6. AUDIT LOG ENGINE
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid,
    action text NOT NULL,
    reference_id text,
    amount numeric,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_log_tenant ON public.financial_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_audit_log_action ON public.financial_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_audit_log_reference ON public.financial_audit_log(reference_id);

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant read financial audit log" ON public.financial_audit_log;
CREATE POLICY "Tenant read financial audit log"
ON public.financial_audit_log
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'treasurer'::app_role)
  )
);

DROP POLICY IF EXISTS "Block direct financial audit writes" ON public.financial_audit_log;
CREATE POLICY "Block direct financial audit writes"
ON public.financial_audit_log
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 7. FINAL IMMUTABILITY LOCK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname='HARD DENY UPDATE'
      AND polrelid='public.double_entry_ledger'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "HARD DENY UPDATE" ON public.double_entry_ledger AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname='HARD DENY DELETE'
      AND polrelid='public.double_entry_ledger'::regclass
  ) THEN
    EXECUTE 'CREATE POLICY "HARD DENY DELETE" ON public.double_entry_ledger AS RESTRICTIVE FOR DELETE USING (false)';
  END IF;
END $$;

-- 8. SECURE CRON SCHEDULING
DO $$
BEGIN
  PERFORM cron.unschedule('akta_daily_snapshot');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('akta_daily_liquidity_v2');
EXCEPTION WHEN others THEN NULL;
END $$;

SELECT cron.schedule(
  'akta_daily_snapshot',
  '55 23 * * *',
  $cron$SELECT public.rpc_generate_daily_snapshot();$cron$
);

SELECT cron.schedule(
  'akta_daily_liquidity_v2',
  '59 23 * * *',
  $cron$SELECT public.rpc_calculate_daily_liquidity_v2();$cron$
);