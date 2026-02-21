
-- ═══════════════════════════════════════════════════════════
-- PHASE B: TREASURER ROLE HARD LOCK — GOVERNANCE & SECURITY
-- ═══════════════════════════════════════════════════════════

-- Drop single-user-id unique constraint to allow multi-role
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;

-- Assign treasurer role to field_officer 468ad4dd (as additional role)
INSERT INTO public.user_roles (user_id, role)
VALUES ('468ad4dd-31d9-47b1-a821-2abc4ddedb8c', 'treasurer')
ON CONFLICT (user_id, role) DO NOTHING;

-- is_treasurer function
CREATE OR REPLACE FUNCTION public.is_treasurer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'treasurer')
$$;

-- APPROVAL PERMISSION LOCK
CREATE OR REPLACE FUNCTION public.approve_financial_transaction(_tx_id uuid, _approver_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _tx              RECORD;
  _receipt         text;
  _allocation      jsonb := '{}'::jsonb;
  _loan            RECORD;
  _savings         RECORD;
  _client          RECORD;
  _remaining       numeric;
  _penalty_paid    numeric := 0;
  _interest_paid   numeric := 0;
  _principal_paid  numeric := 0;
  _new_balance     jsonb;
  _sms_text        text;
  _result          jsonb;
  _ledger_result   jsonb;
  _ledger_entries  jsonb;
  _main_branch_id  uuid := '00000000-0000-0000-0000-000000000001';
  _acct_cash       uuid;
  _acct_loan_prin  uuid;
  _acct_loan_int   uuid;
  _acct_penalty    uuid;
  _acct_savings    uuid;
  _acct_share      uuid;
  _acct_ins_pay    uuid;
  _acct_adm_fee    uuid;
  _acct_ins_prem   uuid;
  _acct_adj        uuid;
  _acct_disb       uuid;
BEGIN
  -- ═══ ROLE PERMISSION CHECK ════════════════════════════════
  IF NOT (public.has_role(_approver_id, 'treasurer') OR public.has_role(_approver_id, 'admin')) THEN
    RAISE EXCEPTION 'Only Treasurer or Admin can approve transactions';
  END IF;

  -- ═══ LOOKUP V2 ACCOUNT IDs ════════════════════════════════
  SELECT id INTO _acct_cash FROM public.accounts WHERE account_code = 'CASH_ON_HAND' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_loan_prin FROM public.accounts WHERE account_code = 'LOAN_PRINCIPAL' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_loan_int FROM public.accounts WHERE account_code = 'LOAN_INTEREST' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_penalty FROM public.accounts WHERE account_code = 'PENALTY_INCOME' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_savings FROM public.accounts WHERE account_code = 'SAVINGS_LIABILITY' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_share FROM public.accounts WHERE account_code = 'SHARE_CAPITAL' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_ins_pay FROM public.accounts WHERE account_code = 'INSURANCE_PAYABLE' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_adm_fee FROM public.accounts WHERE account_code = 'ADMISSION_FEE_INCOME' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_ins_prem FROM public.accounts WHERE account_code = 'INSURANCE_PREMIUM_INCOME' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_adj FROM public.accounts WHERE account_code = 'ADJUSTMENT_ACCOUNT' AND branch_id = _main_branch_id;
  SELECT id INTO _acct_disb FROM public.accounts WHERE account_code = 'DISBURSEMENT_OUTFLOW' AND branch_id = _main_branch_id;

  IF _acct_cash IS NULL THEN
    RAISE EXCEPTION 'V2 Ledger account CASH_ON_HAND not found for main branch';
  END IF;

  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  IF _tx.approval_status = 'approved' THEN
    RAISE EXCEPTION 'Transaction already approved (receipt: %)', _tx.receipt_number;
  END IF;
  IF _tx.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'Transaction already rejected — cannot approve';
  END IF;
  IF _tx.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Transaction status invalid: %', _tx.approval_status;
  END IF;

  IF _tx.created_by = _approver_id THEN
    RAISE EXCEPTION 'Maker cannot approve their own transaction (maker-checker violation)';
  END IF;

  IF _tx.manual_flag AND (_reason IS NULL OR trim(_reason) = '') THEN
    RAISE EXCEPTION 'Manual transactions require approval reason';
  END IF;

  -- ═══ ADJUSTMENT ADMIN-ONLY CHECK ══════════════════════════
  IF _tx.transaction_type = 'adjustment_entry' AND NOT public.has_role(_approver_id, 'admin') THEN
    RAISE EXCEPTION 'Adjustment entries can only be approved by Admin';
  END IF;

  _receipt := public.generate_receipt_number();
  SELECT * INTO _client FROM public.clients WHERE id = _tx.member_id;

  CASE _tx.transaction_type

  WHEN 'loan_repayment' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (loan) required'; END IF;
    _result := public.apply_loan_payment(_tx.account_id, _tx.amount, _tx.created_by, _tx.reference_id);
    _penalty_paid := COALESCE((_result->>'penalty_paid')::numeric, 0);
    _interest_paid := COALESCE((_result->>'interest_paid')::numeric, 0);
    _principal_paid := COALESCE((_result->>'principal_paid')::numeric, 0);
    _allocation := jsonb_build_object('penalty_paid', _penalty_paid, 'interest_paid', _interest_paid, 'principal_paid', _principal_paid);
    PERFORM public.mark_schedule_payment(_tx.account_id, _tx.amount, CURRENT_DATE);
    SELECT outstanding_principal, outstanding_interest, penalty_amount INTO _loan FROM public.loans WHERE id = _tx.account_id;
    _new_balance := jsonb_build_object('outstanding_principal', COALESCE(_loan.outstanding_principal, 0), 'outstanding_interest', COALESCE(_loan.outstanding_interest, 0), 'penalty', COALESCE(_loan.penalty_amount, 0));
    _ledger_entries := '[]'::jsonb;
    _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash received for loan repayment'));
    IF _penalty_paid > 0 THEN _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_penalty, 'entry_type', 'credit', 'account_type', 'income', 'amount', _penalty_paid, 'narration', 'Penalty income')); END IF;
    IF _interest_paid > 0 THEN _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_loan_int, 'entry_type', 'credit', 'account_type', 'income', 'amount', _interest_paid, 'narration', 'Interest income')); END IF;
    IF _principal_paid > 0 THEN _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_loan_prin, 'entry_type', 'credit', 'account_type', 'asset', 'amount', _principal_paid, 'narration', 'Principal recovered')); END IF;
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার ঋণ পরিশোধ ৳%s গৃহীত হয়েছে। বকেয়া: ৳%s। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, (COALESCE(_loan.outstanding_principal,0)+COALESCE(_loan.outstanding_interest,0))::text, _receipt);

  WHEN 'loan_disbursement' THEN
    _allocation := jsonb_build_object('disbursed', _tx.amount);
    _new_balance := jsonb_build_object('disbursed_amount', _tx.amount);
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_loan_prin, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Loan principal disbursed'), jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash disbursed for loan'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার ঋণ ৳%s বিতরণ করা হয়েছে। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'savings_deposit' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes) VALUES (_tx.member_id, _tx.account_id, 'savings_deposit', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance + _tx.amount WHERE id = _tx.account_id;
    SELECT balance INTO _savings FROM public.savings_accounts WHERE id = _tx.account_id;
    _allocation := jsonb_build_object('deposited', _tx.amount);
    _new_balance := jsonb_build_object('savings_balance', COALESCE(_savings.balance, 0));
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash received for savings'), jsonb_build_object('account_id', _acct_savings, 'entry_type', 'credit', 'account_type', 'liability', 'amount', _tx.amount, 'narration', 'Savings liability increased'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার সঞ্চয় জমা ৳%s গৃহীত। ব্যালেন্স: ৳%s। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, COALESCE(_savings.balance, 0)::text, _receipt);

  WHEN 'savings_withdrawal' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    SELECT * INTO _savings FROM public.savings_accounts WHERE id = _tx.account_id;
    IF _savings.balance < _tx.amount THEN RAISE EXCEPTION 'Insufficient savings balance: ৳% available, ৳% requested', _savings.balance, _tx.amount; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes) VALUES (_tx.member_id, _tx.account_id, 'savings_withdrawal', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance - _tx.amount WHERE id = _tx.account_id;
    _new_balance := jsonb_build_object('savings_balance', _savings.balance - _tx.amount);
    _allocation := jsonb_build_object('withdrawn', _tx.amount);
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_savings, 'entry_type', 'debit', 'account_type', 'liability', 'amount', _tx.amount, 'narration', 'Savings liability decreased'), jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash paid for savings withdrawal'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার সঞ্চয় উত্তোলন ৳%s সফল। ব্যালেন্স: ৳%s। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, (_savings.balance - _tx.amount)::text, _receipt);

  WHEN 'admission_fee' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes) VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, 'admission_fee: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'admission_fee', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash received for admission fee'), jsonb_build_object('account_id', _acct_adm_fee, 'entry_type', 'credit', 'account_type', 'income', 'amount', _tx.amount, 'narration', 'Admission fee income'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার ভর্তি ফি ৳%s গৃহীত। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'share_capital_deposit' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes) VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, 'share_capital_deposit: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'share_capital_deposit', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash received for share capital'), jsonb_build_object('account_id', _acct_share, 'entry_type', 'credit', 'account_type', 'equity', 'amount', _tx.amount, 'narration', 'Share capital liability'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার শেয়ার মূলধন ৳%s গৃহীত। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'insurance_premium' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes) VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, 'insurance_premium: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'insurance_premium', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash received for insurance premium'), jsonb_build_object('account_id', _acct_ins_prem, 'entry_type', 'credit', 'account_type', 'income', 'amount', _tx.amount, 'narration', 'Insurance premium income'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার বীমা প্রিমিয়াম ৳%s গৃহীত। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'insurance_claim_payout' THEN
    _allocation := jsonb_build_object('payout', _tx.amount);
    _new_balance := '{}'::jsonb;
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_ins_pay, 'entry_type', 'debit', 'account_type', 'liability', 'amount', _tx.amount, 'narration', 'Insurance claim paid out'), jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Cash paid for insurance claim'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := format('প্রিয় %s, আপনার বীমা দাবি ৳%s অনুমোদিত। রিসিপ্ট: %s', COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'adjustment_entry' THEN
    _allocation := jsonb_build_object('adjustment', _tx.amount, 'reason', _reason);
    _new_balance := '{}'::jsonb;
    _ledger_entries := jsonb_build_array(jsonb_build_object('account_id', _acct_adj, 'entry_type', 'debit', 'account_type', 'expense', 'amount', _tx.amount, 'narration', 'Adjustment: ' || COALESCE(_reason, '')), jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'account_type', 'asset', 'amount', _tx.amount, 'narration', 'Adjustment counter-entry'));
    _ledger_result := public.create_ledger_entry(_main_branch_id, 'financial_transaction', _tx_id, _ledger_entries, _approver_id);
    _sms_text := NULL;

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.transaction_type;
  END CASE;

  _result := jsonb_build_object('receipt_number', _receipt, 'transaction_id', _tx_id, 'member_id', _tx.member_id, 'member_name', COALESCE(_client.name_bn, _client.name_en), 'transaction_type', _tx.transaction_type, 'amount', _tx.amount, 'allocation', _allocation, 'running_balance', _new_balance, 'approved_by', _approver_id, 'approved_at', now(), 'reference_id', _tx.reference_id, 'ledger_group_id', _ledger_result->>'transaction_group_id');

  UPDATE public.financial_transactions SET approval_status = 'approved', approved_by = _approver_id, approved_at = now(), receipt_number = _receipt, receipt_snapshot = _result, allocation_breakdown = _allocation, running_balance = _new_balance, updated_at = now() WHERE id = _tx_id;

  IF _sms_text IS NOT NULL AND _client.phone IS NOT NULL THEN
    INSERT INTO public.sms_logs (transaction_id, recipient_phone, recipient_name, message_text, message_type) VALUES (_tx_id, _client.phone, COALESCE(_client.name_bn, _client.name_en), _sms_text, 'transaction_approval');
  END IF;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details) VALUES ('approve_financial_transaction', 'financial_transaction', _tx_id, _approver_id, _result);

  RETURN _result;
END;
$function$;

-- REVERSAL PERMISSION LOCK
CREATE OR REPLACE FUNCTION public.reverse_ledger_transaction(_transaction_group_id uuid, _reason text, _reversed_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _entry RECORD;
  _new_group_id uuid;
  _caller uuid;
  _branch uuid;
  _entry_count integer := 0;
  _total numeric := 0;
  _reversed_type public.entry_type;
BEGIN
  _caller := COALESCE(_reversed_by, auth.uid());
  IF _caller IS NULL THEN RAISE EXCEPTION 'reversed_by is required'; END IF;

  IF NOT (public.has_role(_caller, 'treasurer') OR public.has_role(_caller, 'admin')) THEN
    RAISE EXCEPTION 'Only Treasurer or Admin can reverse ledger transactions';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN RAISE EXCEPTION 'Reversal reason is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id) THEN
    RAISE EXCEPTION 'No ledger entries found for transaction_group_id: %', _transaction_group_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE original_group_id = _transaction_group_id AND is_reversal = true) THEN
    RAISE EXCEPTION 'Transaction already reversed: %', _transaction_group_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id AND is_reversal = true) THEN
    RAISE EXCEPTION 'Cannot reverse a reversal entry';
  END IF;

  _new_group_id := gen_random_uuid();
  SELECT branch_id INTO _branch FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id LIMIT 1;

  FOR _entry IN SELECT * FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id ORDER BY created_at
  LOOP
    _reversed_type := CASE _entry.entry_type WHEN 'debit' THEN 'credit'::public.entry_type WHEN 'credit' THEN 'debit'::public.entry_type END;
    INSERT INTO public.ledger_entries (branch_id, transaction_group_id, account_id, account_type, entry_type, amount, reference_type, reference_id, narration, is_reversal, original_group_id, created_by)
    VALUES (_entry.branch_id, _new_group_id, _entry.account_id, _entry.account_type, _reversed_type, _entry.amount, _entry.reference_type, _entry.reference_id, 'REVERSAL: ' || COALESCE(_reason, '') || ' | Original: ' || _entry.narration, true, _transaction_group_id, _caller);
    _entry_count := _entry_count + 1;
    IF _entry.entry_type = 'debit' THEN _total := _total + _entry.amount; END IF;
  END LOOP;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('ledger_reversal', 'ledger', _new_group_id, _caller, jsonb_build_object('original_group_id', _transaction_group_id, 'new_group_id', _new_group_id, 'reason', _reason, 'entries_reversed', _entry_count, 'total_amount', _total));

  RETURN jsonb_build_object('success', true, 'original_group_id', _transaction_group_id, 'reversal_group_id', _new_group_id, 'entries_reversed', _entry_count, 'total_amount', _total);
END;
$function$;
