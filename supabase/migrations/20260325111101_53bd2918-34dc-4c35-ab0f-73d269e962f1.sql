
-- ═══════════════════════════════════════
-- 1. JOURNAL RULES TABLE
-- ═══════════════════════════════════════

CREATE TABLE public.journal_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  description text NOT NULL DEFAULT '',
  debit_coa_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  credit_coa_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_journal_rule UNIQUE (tenant_id, trigger_type)
);

CREATE INDEX idx_jr_tenant ON public.journal_rules(tenant_id);
CREATE INDEX idx_jr_trigger ON public.journal_rules(trigger_type);

ALTER TABLE public.journal_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_journal_rules"
  ON public.journal_rules FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_owner_manage_journal_rules"
  ON public.journal_rules FOR ALL TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id())
  WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "treasurer_read_journal_rules"
  ON public.journal_rules FOR SELECT TO authenticated
  USING (is_treasurer());

-- ═══════════════════════════════════════
-- 2. ACCOUNTING PERIODS TABLE
-- ═══════════════════════════════════════

CREATE TABLE public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  locked_by uuid,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_period_tenant_month UNIQUE (tenant_id, period_month)
);

CREATE INDEX idx_ap_tenant ON public.accounting_periods(tenant_id);
CREATE INDEX idx_ap_locked ON public.accounting_periods(tenant_id, is_locked);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_accounting_periods"
  ON public.accounting_periods FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_owner_manage_accounting_periods"
  ON public.accounting_periods FOR ALL TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id())
  WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "treasurer_read_accounting_periods"
  ON public.accounting_periods FOR SELECT TO authenticated
  USING (is_treasurer());

-- ═══════════════════════════════════════
-- 3. LEDGER PROTECTION: Block UPDATE/DELETE
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.block_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Direct mutation of double_entry_ledger is forbidden. Use approved RPCs only.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_ledger_update ON public.double_entry_ledger;
CREATE TRIGGER trg_block_ledger_update
  BEFORE UPDATE ON public.double_entry_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutation();

DROP TRIGGER IF EXISTS trg_block_ledger_delete ON public.double_entry_ledger;
CREATE TRIGGER trg_block_ledger_delete
  BEFORE DELETE ON public.double_entry_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutation();

-- ═══════════════════════════════════════
-- 4. PERIOD LOCK CHECK on ledger INSERT
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_period_lock_on_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_month date;
  v_is_locked boolean;
BEGIN
  v_period_month := date_trunc('month', NEW.created_at)::date;

  SELECT ap.is_locked INTO v_is_locked
  FROM accounting_periods ap
  WHERE ap.tenant_id = NEW.tenant_id
    AND ap.period_month = v_period_month;

  IF v_is_locked IS TRUE THEN
    RAISE EXCEPTION 'Accounting period % is locked. Cannot insert ledger entries.', to_char(v_period_month, 'YYYY-MM');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_period_lock ON public.double_entry_ledger;
CREATE TRIGGER trg_check_period_lock
  BEFORE INSERT ON public.double_entry_ledger
  FOR EACH ROW EXECUTE FUNCTION public.check_period_lock_on_ledger();

-- ═══════════════════════════════════════
-- 5. DYNAMIC map_transaction_to_journal (uses journal_rules)
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.map_transaction_to_journal(
  p_type text, p_amount numeric, p_ref_id uuid, p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_debit_code text;
  v_credit_code text;
BEGIN
  -- Try dynamic rules first
  SELECT jr.*, dc.code AS debit_code, cc.code AS credit_code
  INTO v_rule
  FROM journal_rules jr
  JOIN chart_of_accounts dc ON dc.id = jr.debit_coa_id
  JOIN chart_of_accounts cc ON cc.id = jr.credit_coa_id
  WHERE jr.tenant_id = p_tenant_id
    AND jr.trigger_type = p_type
    AND jr.is_active = true
  LIMIT 1;

  IF v_rule IS NOT NULL THEN
    RETURN jsonb_build_array(
      jsonb_build_object('coa_id', v_rule.debit_coa_id, 'code', v_rule.debit_code, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('coa_id', v_rule.credit_coa_id, 'code', v_rule.credit_code, 'debit', 0, 'credit', p_amount)
    );
  END IF;

  -- Fallback to hardcoded defaults
  CASE p_type
    WHEN 'loan_disbursement' THEN
      v_debit_code := 'LOAN_RECEIVABLE'; v_credit_code := 'CASH';
    WHEN 'emi_payment', 'loan_repayment' THEN
      v_debit_code := 'CASH'; v_credit_code := 'LOAN_RECEIVABLE';
    WHEN 'interest_income' THEN
      v_debit_code := 'CASH'; v_credit_code := 'INTEREST_INCOME';
    WHEN 'penalty_income' THEN
      v_debit_code := 'CASH'; v_credit_code := 'PENALTY_INCOME';
    WHEN 'savings_deposit' THEN
      v_debit_code := 'CASH'; v_credit_code := 'SAVINGS_LIABILITY';
    WHEN 'savings_withdrawal' THEN
      v_debit_code := 'SAVINGS_LIABILITY'; v_credit_code := 'CASH';
    WHEN 'fee_income' THEN
      v_debit_code := 'CASH'; v_credit_code := 'FEE_INCOME';
    WHEN 'insurance_premium' THEN
      v_debit_code := 'CASH'; v_credit_code := 'INSURANCE_PAYABLE';
    ELSE
      RAISE EXCEPTION 'Unknown transaction type: % and no journal rule found', p_type;
  END CASE;

  DECLARE
    v_dr_id uuid;
    v_cr_id uuid;
  BEGIN
    SELECT id INTO v_dr_id FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_debit_code AND is_active LIMIT 1;
    SELECT id INTO v_cr_id FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_credit_code AND is_active LIMIT 1;

    RETURN jsonb_build_array(
      jsonb_build_object('coa_id', v_dr_id, 'code', v_debit_code, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('coa_id', v_cr_id, 'code', v_credit_code, 'debit', 0, 'credit', p_amount)
    );
  END;
END;
$$;

-- ═══════════════════════════════════════
-- 6. RPC: lock_accounting_period
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lock_accounting_period(
  p_month date,
  p_lock boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_uid uuid;
  v_result record;
BEGIN
  v_uid := auth.uid();
  v_tid := get_user_tenant_id();

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve tenant';
  END IF;

  IF NOT is_admin_or_owner() THEN
    RAISE EXCEPTION 'Only admin/owner can lock/unlock periods';
  END IF;

  INSERT INTO accounting_periods (tenant_id, period_month, is_locked, locked_by, locked_at)
  VALUES (v_tid, date_trunc('month', p_month)::date, p_lock, v_uid, CASE WHEN p_lock THEN now() ELSE NULL END)
  ON CONFLICT (tenant_id, period_month)
  DO UPDATE SET
    is_locked = EXCLUDED.is_locked,
    locked_by = EXCLUDED.locked_by,
    locked_at = EXCLUDED.locked_at,
    updated_at = now()
  RETURNING * INTO v_result;

  -- Audit log
  INSERT INTO audit_logs (user_id, entity_type, entity_id, action_type, new_value)
  VALUES (
    v_uid,
    'accounting_period',
    v_result.id,
    CASE WHEN p_lock THEN 'period_locked' ELSE 'period_unlocked' END,
    jsonb_build_object('month', p_month, 'is_locked', p_lock)
  );

  RETURN jsonb_build_object(
    'success', true,
    'period_month', v_result.period_month,
    'is_locked', v_result.is_locked,
    'locked_at', v_result.locked_at
  );
END;
$$;

-- ═══════════════════════════════════════
-- 7. RPC: run_retained_earnings_closure
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_retained_earnings_closure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_uid uuid;
  v_total_income numeric;
  v_total_expense numeric;
  v_net_profit numeric;
  v_re_coa_id uuid;
  v_current_balance numeric;
BEGIN
  v_uid := auth.uid();
  v_tid := get_user_tenant_id();

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve tenant';
  END IF;

  IF NOT is_admin_or_owner() THEN
    RAISE EXCEPTION 'Only admin/owner can run retained earnings closure';
  END IF;

  -- Calculate income (credit - debit for income accounts)
  SELECT COALESCE(SUM(del.credit - del.debit), 0) INTO v_total_income
  FROM double_entry_ledger del
  JOIN chart_of_accounts coa ON coa.id = del.coa_id
  WHERE coa.tenant_id = v_tid AND coa.account_type = 'income';

  -- Calculate expense (debit - credit for expense accounts)
  SELECT COALESCE(SUM(del.debit - del.credit), 0) INTO v_total_expense
  FROM double_entry_ledger del
  JOIN chart_of_accounts coa ON coa.id = del.coa_id
  WHERE coa.tenant_id = v_tid AND coa.account_type = 'expense';

  v_net_profit := v_total_income - v_total_expense;

  -- Get RETAINED_EARNINGS CoA id
  SELECT id INTO v_re_coa_id
  FROM chart_of_accounts
  WHERE tenant_id = v_tid AND code = 'RETAINED_EARNINGS' AND is_active
  LIMIT 1;

  IF v_re_coa_id IS NULL THEN
    RAISE EXCEPTION 'RETAINED_EARNINGS account not found in Chart of Accounts';
  END IF;

  -- Get current retained earnings balance
  SELECT COALESCE(SUM(del.credit - del.debit), 0) INTO v_current_balance
  FROM double_entry_ledger del
  WHERE del.coa_id = v_re_coa_id;

  -- Audit log
  INSERT INTO audit_logs (user_id, entity_type, action_type, new_value, previous_value)
  VALUES (
    v_uid,
    'retained_earnings_closure',
    'closure_run',
    jsonb_build_object(
      'total_income', v_total_income,
      'total_expense', v_total_expense,
      'net_profit', v_net_profit,
      'previous_retained', v_current_balance,
      'new_retained', v_current_balance + v_net_profit
    ),
    jsonb_build_object('retained_before', v_current_balance)
  );

  RETURN jsonb_build_object(
    'success', true,
    'total_income', v_total_income,
    'total_expense', v_total_expense,
    'net_profit', v_net_profit,
    'previous_retained', v_current_balance,
    'new_retained', v_current_balance + v_net_profit,
    'run_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════
-- 8. SEED DEFAULT JOURNAL RULES (RPC)
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.seed_default_journal_rules(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coa_cash uuid;
  v_coa_lr uuid;
  v_coa_int uuid;
  v_coa_pen uuid;
  v_coa_sav uuid;
  v_coa_fee uuid;
  v_coa_ins uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM journal_rules WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT id INTO v_coa_cash FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'CASH' LIMIT 1;
  SELECT id INTO v_coa_lr FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'LOAN_RECEIVABLE' LIMIT 1;
  SELECT id INTO v_coa_int FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'INTEREST_INCOME' LIMIT 1;
  SELECT id INTO v_coa_pen FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'PENALTY_INCOME' LIMIT 1;
  SELECT id INTO v_coa_sav FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'SAVINGS_LIABILITY' LIMIT 1;
  SELECT id INTO v_coa_fee FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'FEE_INCOME' LIMIT 1;
  SELECT id INTO v_coa_ins FROM chart_of_accounts WHERE tenant_id = p_tenant_id AND code = 'INSURANCE_PAYABLE' LIMIT 1;

  IF v_coa_cash IS NULL THEN
    RAISE EXCEPTION 'CoA not seeded yet. Run seed_default_chart_of_accounts first.';
  END IF;

  INSERT INTO journal_rules (tenant_id, trigger_type, description, debit_coa_id, credit_coa_id) VALUES
    (p_tenant_id, 'loan_disbursement',  'Loan disbursement creates receivable',   v_coa_lr,   v_coa_cash),
    (p_tenant_id, 'emi_payment',        'EMI payment reduces receivable',          v_coa_cash, v_coa_lr),
    (p_tenant_id, 'loan_repayment',     'Loan repayment reduces receivable',       v_coa_cash, v_coa_lr),
    (p_tenant_id, 'interest_income',    'Interest earned on loans',                v_coa_cash, v_coa_int),
    (p_tenant_id, 'penalty_income',     'Late penalty credited as income',         v_coa_cash, v_coa_pen),
    (p_tenant_id, 'savings_deposit',    'Member savings deposit',                  v_coa_cash, v_coa_sav),
    (p_tenant_id, 'savings_withdrawal', 'Savings withdrawal by member',            v_coa_sav,  v_coa_cash),
    (p_tenant_id, 'fee_income',         'Processing/admission fee',                v_coa_cash, v_coa_fee),
    (p_tenant_id, 'insurance_premium',  'Insurance premium collection',            v_coa_cash, v_coa_ins);
END;
$$;
