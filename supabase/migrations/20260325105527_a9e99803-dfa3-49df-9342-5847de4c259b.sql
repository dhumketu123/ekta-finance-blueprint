
-- Drop old function with conflicting return type
DROP FUNCTION IF EXISTS public.validate_ledger_balance(uuid);
DROP FUNCTION IF EXISTS public.validate_ledger_balance();

-- ═══════════════════════════════════════
-- STEP 7: Ledger Balance Validation
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_ledger_balance(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
  v_total_debit numeric;
  v_total_credit numeric;
  v_diff numeric;
BEGIN
  v_tid := COALESCE(p_tenant_id, get_user_tenant_id());

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM double_entry_ledger
  WHERE tenant_id = v_tid;

  v_diff := ABS(v_total_debit - v_total_credit);

  RETURN jsonb_build_object(
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'difference', v_diff,
    'is_balanced', v_diff < 0.01,
    'checked_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════
-- STEP 8: Seed Default CoA (RPC)
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant_id LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO chart_of_accounts (tenant_id, code, name, name_bn, account_type) VALUES
    (p_tenant_id, 'CASH',              'Cash on Hand',           'নগদ তহবিল',           'asset'),
    (p_tenant_id, 'LOAN_RECEIVABLE',   'Loan Receivable',        'ঋণ গ্রহণযোগ্য',       'asset'),
    (p_tenant_id, 'BANK_BALANCE',      'Bank Balance',            'ব্যাংক ব্যালেন্স',    'asset'),
    (p_tenant_id, 'SAVINGS_LIABILITY', 'Savings Liability',       'সঞ্চয় দায়',           'liability'),
    (p_tenant_id, 'INSURANCE_PAYABLE', 'Insurance Payable',       'বীমা প্রদেয়',         'liability'),
    (p_tenant_id, 'INVESTOR_CAPITAL',  'Investor Capital',        'বিনিয়োগকারী মূলধন',   'liability'),
    (p_tenant_id, 'OWNER_EQUITY',      'Owner Equity',            'মালিকের ইকুইটি',       'equity'),
    (p_tenant_id, 'RETAINED_EARNINGS', 'Retained Earnings',       'সংরক্ষিত আয়',         'equity'),
    (p_tenant_id, 'INTEREST_INCOME',   'Loan Interest Income',    'ঋণ সুদ আয়',           'income'),
    (p_tenant_id, 'PENALTY_INCOME',    'Penalty Income',          'জরিমানা আয়',          'income'),
    (p_tenant_id, 'FEE_INCOME',        'Fee Income',              'ফি আয়',               'income'),
    (p_tenant_id, 'INSURANCE_PREMIUM_INCOME', 'Insurance Premium Income', 'বীমা প্রিমিয়াম আয়', 'income'),
    (p_tenant_id, 'SALARY_EXPENSE',    'Salary Expense',          'বেতন ব্যয়',           'expense'),
    (p_tenant_id, 'OFFICE_EXPENSE',    'Office Expense',          'অফিস ব্যয়',           'expense'),
    (p_tenant_id, 'PROVISION_EXPENSE', 'Provision for Bad Debt',  'অনাদায়ী ঋণ সংরক্ষণ',  'expense');
END;
$$;
