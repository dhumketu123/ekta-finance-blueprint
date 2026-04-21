-- =============================================================================
-- AKTA FINANCE GROUP — RESERVE ARCHITECTURE v1
-- Layer 1: Account hardening
-- Layer 2: Provisioning, profit allocation, liquidity RPCs
-- Layer 3: pg_cron schedules + ledger immutability hardening
-- Surgical: no existing tables/policies/data are modified destructively.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- LAYER 1 — ACCOUNT STRUCTURE HARDENING
-- Idempotent INSERT into accounts (branch-scoped, MAIN branch).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_branch_id uuid;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE code = 'MAIN' LIMIT 1;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'MAIN branch not found — Reserve Architecture requires a MAIN branch';
  END IF;

  INSERT INTO public.accounts (branch_id, account_code, name, name_bn, account_type, is_active)
  VALUES
    (v_branch_id, 'RISK_RESERVE',           'Risk Reserve',           'ঝুঁকি সঞ্চিতি',     'equity'::public.account_type, true),
    (v_branch_id, 'GENERAL_RESERVE',        'General Reserve',        'সাধারণ সঞ্চিতি',    'equity'::public.account_type, true),
    (v_branch_id, 'RETAINED_EARNINGS',      'Retained Earnings',      'অবণ্টিত মুনাফা',     'equity'::public.account_type, true),
    (v_branch_id, 'RISK_PROVISION_EXPENSE', 'Risk Provision Expense', 'ঝুঁকি সঞ্চিতি খরচ',  'expense'::public.account_type, true),
    (v_branch_id, 'BANK_ACCOUNT',           'Bank Account',           'ব্যাংক হিসাব',       'asset'::public.account_type, true)
  ON CONFLICT (branch_id, account_code) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- daily_financial_summary — add liquidity_ratio column (idempotent)
-- -----------------------------------------------------------------------------
ALTER TABLE public.daily_financial_summary
  ADD COLUMN IF NOT EXISTS liquidity_ratio numeric;

-- One-row-per-date guard (idempotent recompute target)
CREATE UNIQUE INDEX IF NOT EXISTS daily_financial_summary_summary_date_key
  ON public.daily_financial_summary (summary_date);

-- -----------------------------------------------------------------------------
-- Internal helper: post a balanced ledger pair for a single tenant.
-- SECURITY DEFINER, owned by postgres → bypasses Block-direct-insert RLS
-- and the BEFORE INSERT block, but still triggers the deferred validator.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._post_balanced_pair(
  p_tenant_id      uuid,
  p_reference_type text,
  p_reference_id   uuid,
  p_debit_code     text,
  p_credit_code    text,
  p_amount         numeric,
  p_narration      text,
  p_actor          uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id  uuid;
  v_debit_id   uuid;
  v_credit_id  uuid;
  v_debit_type public.account_type;
  v_credit_type public.account_type;
  v_debit_prev  numeric;
  v_credit_prev numeric;
  v_debit_after numeric;
  v_credit_after numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_branch_id FROM public.branches WHERE code = 'MAIN' LIMIT 1;

  SELECT id, account_type INTO v_debit_id, v_debit_type
  FROM public.accounts
  WHERE branch_id = v_branch_id AND account_code = p_debit_code AND is_active = true;
  IF v_debit_id IS NULL THEN
    RAISE EXCEPTION 'Account % not found', p_debit_code;
  END IF;

  SELECT id, account_type INTO v_credit_id, v_credit_type
  FROM public.accounts
  WHERE branch_id = v_branch_id AND account_code = p_credit_code AND is_active = true;
  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Account % not found', p_credit_code;
  END IF;

  -- Running balance (per account) from last ledger entry
  SELECT COALESCE(balance_after, 0) INTO v_debit_prev
  FROM public.double_entry_ledger
  WHERE tenant_id = p_tenant_id AND account_id = v_debit_id
  ORDER BY created_at DESC, id DESC LIMIT 1;
  v_debit_prev := COALESCE(v_debit_prev, 0);

  SELECT COALESCE(balance_after, 0) INTO v_credit_prev
  FROM public.double_entry_ledger
  WHERE tenant_id = p_tenant_id AND account_id = v_credit_id
  ORDER BY created_at DESC, id DESC LIMIT 1;
  v_credit_prev := COALESCE(v_credit_prev, 0);

  -- Asset/Expense: debit increases; Liability/Equity/Income: credit increases
  v_debit_after := CASE
    WHEN v_debit_type IN ('asset','expense') THEN v_debit_prev + p_amount
    ELSE v_debit_prev - p_amount
  END;
  v_credit_after := CASE
    WHEN v_credit_type IN ('liability','equity','income') THEN v_credit_prev + p_amount
    ELSE v_credit_prev - p_amount
  END;

  INSERT INTO public.double_entry_ledger
    (tenant_id, reference_type, reference_id, account_type, account_id,
     debit, credit, balance_after, narration, created_by)
  VALUES
    (p_tenant_id, p_reference_type, p_reference_id, v_debit_type::text, v_debit_id,
     p_amount, 0, v_debit_after, p_narration, COALESCE(p_actor, '00000000-0000-0000-0000-000000000000'::uuid)),
    (p_tenant_id, p_reference_type, p_reference_id, v_credit_type::text, v_credit_id,
     0, p_amount, v_credit_after, p_narration, COALESCE(p_actor, '00000000-0000-0000-0000-000000000000'::uuid));
END;
$$;

REVOKE ALL ON FUNCTION public._post_balanced_pair(uuid,text,uuid,text,text,numeric,text,uuid) FROM public, anon, authenticated;

-- =============================================================================
-- LAYER 2 — CORE FINANCIAL RULES (RPCs)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 rpc_disburse_loan_with_provision
--     Posts disbursement (LOAN_PRINCIPAL ↔ CASH_ON_HAND) and provisioning
--     (RISK_PROVISION_EXPENSE ↔ RISK_RESERVE) atomically.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_disburse_loan_with_provision(
  p_loan_id        uuid,
  p_amount         numeric,
  p_provision_rate numeric DEFAULT 2.0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_actor     uuid := auth.uid();
  v_provision numeric;
  v_disb_ref  uuid := gen_random_uuid();
  v_prov_ref  uuid := gen_random_uuid();
BEGIN
  IF p_loan_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid disbursement parameters';
  END IF;
  IF p_provision_rate IS NULL OR p_provision_rate < 0 OR p_provision_rate > 100 THEN
    RAISE EXCEPTION 'provision_rate must be between 0 and 100';
  END IF;

  SELECT c.tenant_id INTO v_tenant_id
  FROM public.loans l JOIN public.clients c ON c.id = l.client_id
  WHERE l.id = p_loan_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Loan % not found', p_loan_id;
  END IF;

  -- Pair 1: Disbursement
  PERFORM public._post_balanced_pair(
    v_tenant_id, 'loan_disbursement', v_disb_ref,
    'LOAN_PRINCIPAL', 'CASH_ON_HAND',
    p_amount,
    'Loan disbursement #' || p_loan_id::text,
    v_actor
  );

  -- Pair 2: Risk provision (only if rate > 0)
  v_provision := ROUND(p_amount * p_provision_rate / 100.0, 2);
  IF v_provision > 0 THEN
    PERFORM public._post_balanced_pair(
      v_tenant_id, 'loan_provision', v_prov_ref,
      'RISK_PROVISION_EXPENSE', 'RISK_RESERVE',
      v_provision,
      'Risk provision @' || p_provision_rate || '% for loan ' || p_loan_id::text,
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'loan_id', p_loan_id,
    'disbursed_amount', p_amount,
    'provision_amount', v_provision,
    'disbursement_ref', v_disb_ref,
    'provision_ref', v_prov_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_disburse_loan_with_provision(uuid,numeric,numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_disburse_loan_with_provision(uuid,numeric,numeric) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2.2 rpc_monthly_profit_close
--     Closes the month: realized income − expenses → split:
--       40% General Reserve, 20% Risk Reserve, 20% retained, 20% owner payable
-- -----------------------------------------------------------------------------
-- Owner payable (liability) is needed for the 20% distribution leg.
DO $$
DECLARE v_branch_id uuid;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE code='MAIN' LIMIT 1;
  INSERT INTO public.accounts (branch_id, account_code, name, name_bn, account_type, is_active)
  VALUES (v_branch_id, 'OWNER_PAYABLE', 'Owner / Investor Payable', 'মালিক/বিনিয়োগকারী প্রদেয়', 'liability'::public.account_type, true)
  ON CONFLICT (branch_id, account_code) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_monthly_profit_close(
  p_period_month date DEFAULT NULL  -- any date inside target month; default = previous month
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_actor        uuid := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_branch_id    uuid;
  v_period_start date;
  v_period_end   date;
  v_income       numeric := 0;
  v_expense      numeric := 0;
  v_net_profit   numeric := 0;
  v_general      numeric;
  v_risk         numeric;
  v_retained     numeric;
  v_owner        numeric;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE code='MAIN' LIMIT 1;

  -- Default period = previous calendar month
  v_period_start := date_trunc('month', COALESCE(p_period_month, (CURRENT_DATE - INTERVAL '1 month')::date))::date;
  v_period_end   := (v_period_start + INTERVAL '1 month')::date;

  -- Loop tenants — close per tenant (multi-tenant safe)
  FOR v_tenant_id IN SELECT id FROM public.tenants LOOP

    -- Realized income for the period (credits − debits on income accounts)
    SELECT COALESCE(SUM(l.credit - l.debit), 0) INTO v_income
    FROM public.double_entry_ledger l
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id
      AND a.account_type = 'income'
      AND l.created_at >= v_period_start
      AND l.created_at <  v_period_end;

    -- Expenses (debits − credits on expense accounts)
    SELECT COALESCE(SUM(l.debit - l.credit), 0) INTO v_expense
    FROM public.double_entry_ledger l
    JOIN public.accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id
      AND a.account_type = 'expense'
      AND l.created_at >= v_period_start
      AND l.created_at <  v_period_end;

    v_net_profit := v_income - v_expense;

    IF v_net_profit > 0 THEN
      v_general  := ROUND(v_net_profit * 0.40, 2);
      v_risk     := ROUND(v_net_profit * 0.20, 2);
      v_owner    := ROUND(v_net_profit * 0.20, 2);
      v_retained := ROUND(v_net_profit - v_general - v_risk - v_owner, 2);  -- residual avoids rounding drift

      -- 1. Close P&L into Retained Earnings:
      --    DR Income (close) -> CR Retained Earnings  (we model as: DR Retained, CR Reserves below)
      --    For each split, post a balanced pair sourced from RETAINED_EARNINGS.

      -- 40% General Reserve
      IF v_general > 0 THEN
        PERFORM public._post_balanced_pair(
          v_tenant_id, 'monthly_profit_close', gen_random_uuid(),
          'RETAINED_EARNINGS', 'GENERAL_RESERVE',
          v_general,
          'Monthly close ' || to_char(v_period_start,'YYYY-MM') || ' — 40% General Reserve',
          v_actor
        );
      END IF;

      -- 20% Risk Reserve
      IF v_risk > 0 THEN
        PERFORM public._post_balanced_pair(
          v_tenant_id, 'monthly_profit_close', gen_random_uuid(),
          'RETAINED_EARNINGS', 'RISK_RESERVE',
          v_risk,
          'Monthly close ' || to_char(v_period_start,'YYYY-MM') || ' — 20% Risk Reserve',
          v_actor
        );
      END IF;

      -- 20% Owner / Investor Payable
      IF v_owner > 0 THEN
        PERFORM public._post_balanced_pair(
          v_tenant_id, 'monthly_profit_close', gen_random_uuid(),
          'RETAINED_EARNINGS', 'OWNER_PAYABLE',
          v_owner,
          'Monthly close ' || to_char(v_period_start,'YYYY-MM') || ' — 20% Owner payable',
          v_actor
        );
      END IF;

      -- 20% retained (no movement needed — it stays in Retained Earnings naturally
      -- since income wasn't yet swept). We post a self-noting pair to keep audit trail.
      -- Skip ledger churn; record only in returned summary.
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period_start', v_period_start,
    'period_end',   v_period_end,
    'last_tenant_summary', jsonb_build_object(
      'income', v_income, 'expense', v_expense, 'net_profit', v_net_profit,
      'general_reserve', v_general, 'risk_reserve', v_risk,
      'owner_payable', v_owner, 'retained', v_retained
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_monthly_profit_close(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_monthly_profit_close(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2.3 rpc_calculate_daily_liquidity
--     Liquidity = (CASH_ON_HAND + BANK_ACCOUNT) / SAVINGS_LIABILITY
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_calculate_daily_liquidity(
  p_summary_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id    uuid;
  v_cash_id      uuid;
  v_bank_id      uuid;
  v_savings_id   uuid;
  v_cash_bal     numeric := 0;
  v_bank_bal     numeric := 0;
  v_savings_bal  numeric := 0;
  v_ratio        numeric;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE code='MAIN' LIMIT 1;

  SELECT id INTO v_cash_id    FROM public.accounts WHERE branch_id=v_branch_id AND account_code='CASH_ON_HAND';
  SELECT id INTO v_bank_id    FROM public.accounts WHERE branch_id=v_branch_id AND account_code='BANK_ACCOUNT';
  SELECT id INTO v_savings_id FROM public.accounts WHERE branch_id=v_branch_id AND account_code='SAVINGS_LIABILITY';

  -- Cash (asset): debits − credits
  SELECT COALESCE(SUM(debit - credit), 0) INTO v_cash_bal
  FROM public.double_entry_ledger
  WHERE account_id = v_cash_id;

  SELECT COALESCE(SUM(debit - credit), 0) INTO v_bank_bal
  FROM public.double_entry_ledger
  WHERE account_id = v_bank_id;

  -- Savings (liability): credits − debits
  SELECT COALESCE(SUM(credit - debit), 0) INTO v_savings_bal
  FROM public.double_entry_ledger
  WHERE account_id = v_savings_id;

  v_ratio := CASE WHEN v_savings_bal > 0
                  THEN ROUND((v_cash_bal + v_bank_bal) / v_savings_bal, 4)
                  ELSE NULL
             END;

  -- Upsert into daily_financial_summary
  INSERT INTO public.daily_financial_summary (summary_date, liquidity_ratio, updated_at)
  VALUES (p_summary_date, v_ratio, now())
  ON CONFLICT (summary_date) DO UPDATE
    SET liquidity_ratio = EXCLUDED.liquidity_ratio,
        updated_at = now();

  RETURN jsonb_build_object(
    'summary_date', p_summary_date,
    'cash_on_hand', v_cash_bal,
    'bank_account', v_bank_bal,
    'savings_liability', v_savings_bal,
    'liquidity_ratio', v_ratio
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_calculate_daily_liquidity(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_calculate_daily_liquidity(date) TO authenticated;

-- =============================================================================
-- LAYER 3 — IMMUTABILITY HARDENING + pg_cron AUTOMATION
-- =============================================================================

-- Strengthen RLS: explicit DENY for UPDATE / DELETE on double_entry_ledger.
-- (Existing triggers already raise; RLS is belt-and-suspenders.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid='public.double_entry_ledger'::regclass
      AND polname='Deny update double_entry_ledger'
  ) THEN
    EXECUTE 'CREATE POLICY "Deny update double_entry_ledger" ON public.double_entry_ledger AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid='public.double_entry_ledger'::regclass
      AND polname='Deny delete double_entry_ledger'
  ) THEN
    EXECUTE 'CREATE POLICY "Deny delete double_entry_ledger" ON public.double_entry_ledger AS RESTRICTIVE FOR DELETE TO public USING (false)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- pg_cron jobs (in-DB SELECTs — no HTTP/edge-function detour needed, ↓ attack
-- surface, ↑ reliability). Idempotent unschedule + reschedule.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('akta_daily_liquidity');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('akta_monthly_profit_close');
EXCEPTION WHEN others THEN NULL;
END $$;

-- Daily 23:59 (server time) — liquidity snapshot
SELECT cron.schedule(
  'akta_daily_liquidity',
  '59 23 * * *',
  $cron$ SELECT public.rpc_calculate_daily_liquidity(CURRENT_DATE); $cron$
);

-- Last-day-of-month 23:50 — profit close.
-- pg_cron can't natively express "last day", so we run nightly at 23:50 and
-- gate execution to the actual last day of the month inside the SQL.
SELECT cron.schedule(
  'akta_monthly_profit_close',
  '50 23 * * *',
  $cron$
    SELECT CASE
      WHEN (CURRENT_DATE + INTERVAL '1 day')::date = date_trunc('month', CURRENT_DATE + INTERVAL '1 month')::date
      THEN public.rpc_monthly_profit_close(CURRENT_DATE)
      ELSE NULL
    END;
  $cron$
);
