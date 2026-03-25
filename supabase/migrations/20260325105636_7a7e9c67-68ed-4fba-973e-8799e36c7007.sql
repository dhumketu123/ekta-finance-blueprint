
-- ═══════════════════════════════════════
-- STEP 1: Chart of Accounts Table
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  account_type text NOT NULL,
  parent_id uuid REFERENCES public.chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_coa_tenant_code UNIQUE (tenant_id, code)
);

CREATE OR REPLACE FUNCTION public.validate_coa_account_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_type NOT IN ('asset','liability','equity','income','expense') THEN
    RAISE EXCEPTION 'Invalid account_type: %', NEW.account_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_coa_account_type ON public.chart_of_accounts;
CREATE TRIGGER trg_validate_coa_account_type
  BEFORE INSERT OR UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_coa_account_type();

CREATE INDEX IF NOT EXISTS idx_coa_tenant ON public.chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON public.chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_coa_type ON public.chart_of_accounts(account_type);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chart_of_accounts' AND policyname='tenant_read_coa') THEN
    CREATE POLICY "tenant_read_coa" ON public.chart_of_accounts FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chart_of_accounts' AND policyname='admin_owner_manage_coa') THEN
    CREATE POLICY "admin_owner_manage_coa" ON public.chart_of_accounts FOR ALL TO authenticated USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id()) WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chart_of_accounts' AND policyname='treasurer_read_coa') THEN
    CREATE POLICY "treasurer_read_coa" ON public.chart_of_accounts FOR SELECT TO authenticated USING (is_treasurer());
  END IF;
END $$;

-- ═══════════════════════════════════════
-- STEP 2: Link double_entry_ledger with CoA
-- ═══════════════════════════════════════

ALTER TABLE public.double_entry_ledger
  ADD COLUMN IF NOT EXISTS coa_id uuid REFERENCES public.chart_of_accounts(id);

CREATE INDEX IF NOT EXISTS idx_del_coa ON public.double_entry_ledger(coa_id);

-- ═══════════════════════════════════════
-- STEP 3: Journal Mapping Engine
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.map_transaction_to_journal(
  p_type text, p_amount numeric, p_ref_id uuid, p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entries jsonb;
  v_coa_cash uuid; v_coa_loan_recv uuid; v_coa_interest uuid;
  v_coa_penalty uuid; v_coa_savings uuid; v_coa_fee uuid; v_coa_insurance uuid;
BEGIN
  SELECT id INTO v_coa_cash FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='CASH' AND is_active LIMIT 1;
  SELECT id INTO v_coa_loan_recv FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='LOAN_RECEIVABLE' AND is_active LIMIT 1;
  SELECT id INTO v_coa_interest FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='INTEREST_INCOME' AND is_active LIMIT 1;
  SELECT id INTO v_coa_penalty FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='PENALTY_INCOME' AND is_active LIMIT 1;
  SELECT id INTO v_coa_savings FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='SAVINGS_LIABILITY' AND is_active LIMIT 1;
  SELECT id INTO v_coa_fee FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='FEE_INCOME' AND is_active LIMIT 1;
  SELECT id INTO v_coa_insurance FROM chart_of_accounts WHERE tenant_id=p_tenant_id AND code='INSURANCE_PAYABLE' AND is_active LIMIT 1;

  CASE p_type
    WHEN 'loan_disbursement' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_loan_recv,'code','LOAN_RECEIVABLE','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',0,'credit',p_amount));
    WHEN 'emi_payment','loan_repayment' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_loan_recv,'code','LOAN_RECEIVABLE','debit',0,'credit',p_amount));
    WHEN 'interest_income' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_interest,'code','INTEREST_INCOME','debit',0,'credit',p_amount));
    WHEN 'penalty_income' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_penalty,'code','PENALTY_INCOME','debit',0,'credit',p_amount));
    WHEN 'savings_deposit' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_savings,'code','SAVINGS_LIABILITY','debit',0,'credit',p_amount));
    WHEN 'savings_withdrawal' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_savings,'code','SAVINGS_LIABILITY','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',0,'credit',p_amount));
    WHEN 'fee_income' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_fee,'code','FEE_INCOME','debit',0,'credit',p_amount));
    WHEN 'insurance_premium' THEN
      v_entries := jsonb_build_array(
        jsonb_build_object('coa_id',v_coa_cash,'code','CASH','debit',p_amount,'credit',0),
        jsonb_build_object('coa_id',v_coa_insurance,'code','INSURANCE_PAYABLE','debit',0,'credit',p_amount));
    ELSE RAISE EXCEPTION 'Unknown transaction type: %', p_type;
  END CASE;
  RETURN v_entries;
END;
$$;

-- ═══════════════════════════════════════
-- STEP 4: Trial Balance RPC
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, total_debit numeric, total_credit numeric, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := COALESCE(p_tenant_id, get_user_tenant_id());
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    COALESCE(SUM(del.debit),0), COALESCE(SUM(del.credit),0),
    COALESCE(SUM(del.debit),0) - COALESCE(SUM(del.credit),0)
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id = coa.id
  WHERE coa.tenant_id = v_tid AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY coa.code;
END;
$$;

-- ═══════════════════════════════════════
-- STEP 5: Profit & Loss RPC
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_profit_loss(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := COALESCE(p_tenant_id, get_user_tenant_id());
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    CASE WHEN coa.account_type='income' THEN COALESCE(SUM(del.credit-del.debit),0)
         WHEN coa.account_type='expense' THEN COALESCE(SUM(del.debit-del.credit),0)
         ELSE 0 END
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id=coa.id
    AND (p_from IS NULL OR del.created_at >= p_from::timestamptz)
    AND (p_to IS NULL OR del.created_at < (p_to + interval '1 day')::timestamptz)
  WHERE coa.tenant_id=v_tid AND coa.account_type IN ('income','expense') AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY coa.account_type, coa.code;
END;
$$;

-- ═══════════════════════════════════════
-- STEP 6: Balance Sheet RPC
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of date DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := COALESCE(p_tenant_id, get_user_tenant_id());
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    CASE WHEN coa.account_type='asset' THEN COALESCE(SUM(del.debit-del.credit),0)
         WHEN coa.account_type IN ('liability','equity') THEN COALESCE(SUM(del.credit-del.debit),0)
         ELSE 0 END
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id=coa.id
    AND (p_as_of IS NULL OR del.created_at <= (p_as_of + interval '1 day')::timestamptz)
  WHERE coa.tenant_id=v_tid AND coa.account_type IN ('asset','liability','equity') AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY CASE coa.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END, coa.code;
END;
$$;
