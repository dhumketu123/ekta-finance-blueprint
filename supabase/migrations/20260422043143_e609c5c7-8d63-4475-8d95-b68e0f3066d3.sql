
-- =============================================================================
-- v3 BANK-GRADE LAUNCH HARDENING
-- =============================================================================

-- 1. ATOMIC DISBURSEMENT (single RPC, single transaction, full rollback)
-- Wraps disburse_loan + rpc_disburse_loan_with_provision so that if either
-- fails, the entire operation rolls back (PL/pgSQL runs in one tx by default).
CREATE OR REPLACE FUNCTION public.rpc_disburse_loan_atomic(
  _client_id         uuid,
  _loan_product_id   uuid,
  _principal_amount  numeric,
  _disbursement_date date,
  _assigned_officer  uuid DEFAULT NULL,
  _notes             text DEFAULT NULL,
  _loan_model        text DEFAULT 'flat',
  _provision_rate    numeric DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disb     jsonb;
  v_prov     jsonb;
  v_loan_id  uuid;
BEGIN
  -- Step 1: Create loan + schedules + base ledger (atomic inside this tx)
  v_disb := public.disburse_loan(
    _client_id, _loan_product_id, _principal_amount,
    _disbursement_date, _assigned_officer, _notes, _loan_model
  );

  v_loan_id := COALESCE(
    NULLIF(v_disb->>'loan_id','')::uuid,
    NULLIF(v_disb->>'id','')::uuid
  );

  IF v_loan_id IS NULL THEN
    RAISE EXCEPTION 'Disbursement returned no loan_id — aborting (atomic rollback)';
  END IF;

  -- Step 2: Risk provisioning (same tx — failure rolls back loan above)
  v_prov := public.rpc_disburse_loan_with_provision(
    v_loan_id, _principal_amount, _provision_rate
  );

  RETURN jsonb_build_object(
    'success', true,
    'disbursement', v_disb,
    'provision', v_prov
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_disburse_loan_atomic(uuid,uuid,numeric,date,uuid,text,text,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_disburse_loan_atomic(uuid,uuid,numeric,date,uuid,text,text,numeric) TO authenticated;


-- 2. SNAPSHOT FRESHNESS — track last successful run
ALTER TABLE public.account_balance_snapshot_v2
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_snapshot_v2_last_run ON public.account_balance_snapshot_v2(last_run_at DESC);

-- Re-create snapshot RPC to stamp last_run_at
CREATE OR REPLACE FUNCTION public.rpc_generate_snapshot_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.account_balance_snapshot_v2(
    snapshot_date, snapshot_time, account_id, tenant_id, balance, version, last_run_at
  )
  SELECT
    CURRENT_DATE, v_now, account_id, tenant_id,
    SUM(debit - credit),
    EXTRACT(EPOCH FROM v_now)::bigint,
    v_now
  FROM public.double_entry_ledger
  GROUP BY account_id, tenant_id;
END;
$$;

-- Re-enforce cron at 23:55 idempotently
DO $$
BEGIN
  PERFORM cron.unschedule('v2_snapshot_engine');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('v2_snapshot_engine', '55 23 * * *', 'SELECT public.rpc_generate_snapshot_v2();');


-- 3. SAFETY GUARDS — prevent negative CASH_ON_HAND / RISK_RESERVE balances
-- Implemented via trigger (CHECK constraints can't reference SUM across rows)
CREATE OR REPLACE FUNCTION public.fn_guard_protected_account_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code    text;
  v_balance numeric;
BEGIN
  SELECT account_code INTO v_code FROM public.accounts WHERE id = NEW.account_id;

  IF v_code IN ('CASH_ON_HAND','RISK_RESERVE') THEN
    SELECT COALESCE(SUM(debit - credit),0) + (NEW.debit - NEW.credit)
      INTO v_balance
    FROM public.double_entry_ledger
    WHERE account_id = NEW.account_id;

    IF v_balance < 0 THEN
      RAISE EXCEPTION
        'Negative balance forbidden on % — would become %',
        v_code, v_balance
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_protected_balance ON public.double_entry_ledger;
CREATE TRIGGER trg_guard_protected_balance
  BEFORE INSERT ON public.double_entry_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_protected_account_balance();
