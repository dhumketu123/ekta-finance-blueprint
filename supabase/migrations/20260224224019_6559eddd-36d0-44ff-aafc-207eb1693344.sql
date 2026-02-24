
-- ═══ FEATURE FLAG: Maker-Checker Bypass ═══════════════════════
-- Insert feature flag into system_settings if not exists
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES ('maker_checker_enabled', '"false"'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- ═══ UPDATE approve_financial_transaction: Add feature flag bypass ═══
CREATE OR REPLACE FUNCTION public.approve_financial_transaction(
  _tx_id uuid,
  _approver_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
  _maker_checker   boolean := true;
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

  -- ═══ FEATURE FLAG: Maker-Checker Validation ═══════════════
  -- To re-enable: UPDATE system_settings SET setting_value = '"true"' WHERE setting_key = 'maker_checker_enabled';
  SELECT COALESCE((setting_value #>> '{}')::boolean, true) INTO _maker_checker
  FROM public.system_settings WHERE setting_key = 'maker_checker_enabled';

  IF COALESCE(_maker_checker, true) AND _tx.created_by = _approver_id THEN
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
    _allocation := jsonb_build_object('penalty', _penalty_paid, 'interest', _interest_paid, 'principal', _principal_paid);
    -- V2 Ledger entries for loan repayment
    _ledger_entries := '[]'::jsonb;
    IF _principal_paid > 0 AND _acct_loan_prin IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _principal_paid, 'narration', 'Loan principal repayment'));
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_loan_prin, 'entry_type', 'credit', 'amount', _principal_paid, 'narration', 'Loan principal received'));
    END IF;
    IF _interest_paid > 0 AND _acct_loan_int IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _interest_paid, 'narration', 'Loan interest repayment'));
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_loan_int, 'entry_type', 'credit', 'amount', _interest_paid, 'narration', 'Loan interest income'));
    END IF;
    IF _penalty_paid > 0 AND _acct_penalty IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _penalty_paid, 'narration', 'Penalty collection'));
      _ledger_entries := _ledger_entries || jsonb_build_array(jsonb_build_object('account_id', _acct_penalty, 'entry_type', 'credit', 'amount', _penalty_paid, 'narration', 'Penalty income'));
    END IF;

  WHEN 'loan_disbursement' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (loan) required for disbursement'; END IF;
    _result := jsonb_build_object('type', 'loan_disbursement', 'loan_id', _tx.account_id, 'amount', _tx.amount);
    _allocation := jsonb_build_object('principal', _tx.amount);
    _ledger_entries := jsonb_build_array(
      jsonb_build_object('account_id', COALESCE(_acct_disb, _acct_loan_prin), 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Loan disbursement outflow'),
      jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Cash paid for disbursement')
    );

  WHEN 'savings_deposit' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    UPDATE public.savings_accounts SET balance = balance + _tx.amount, updated_at = now() WHERE id = _tx.account_id;
    SELECT balance INTO _remaining FROM public.savings_accounts WHERE id = _tx.account_id;
    _result := jsonb_build_object('type', 'savings_deposit', 'savings_id', _tx.account_id, 'amount', _tx.amount, 'new_balance', _remaining);
    _allocation := jsonb_build_object('savings', _tx.amount);
    IF _acct_savings IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Savings deposit received'),
        jsonb_build_object('account_id', _acct_savings, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Savings liability increased')
      );
    END IF;

  WHEN 'savings_withdrawal' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    SELECT balance INTO _remaining FROM public.savings_accounts WHERE id = _tx.account_id;
    IF _remaining < _tx.amount THEN RAISE EXCEPTION 'Insufficient savings balance (available: %)', _remaining; END IF;
    UPDATE public.savings_accounts SET balance = balance - _tx.amount, updated_at = now() WHERE id = _tx.account_id;
    _remaining := _remaining - _tx.amount;
    _result := jsonb_build_object('type', 'savings_withdrawal', 'savings_id', _tx.account_id, 'amount', _tx.amount, 'new_balance', _remaining);
    _allocation := jsonb_build_object('savings', _tx.amount);
    IF _acct_savings IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_savings, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Savings withdrawal'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Cash paid for withdrawal')
      );
    END IF;

  WHEN 'admission_fee' THEN
    _result := jsonb_build_object('type', 'admission_fee', 'amount', _tx.amount);
    _allocation := jsonb_build_object('admission_fee', _tx.amount);
    IF _acct_adm_fee IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Admission fee received'),
        jsonb_build_object('account_id', _acct_adm_fee, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Admission fee income')
      );
    END IF;

  WHEN 'share_capital_deposit' THEN
    _result := jsonb_build_object('type', 'share_capital_deposit', 'amount', _tx.amount);
    _allocation := jsonb_build_object('share_capital', _tx.amount);
    IF _acct_share IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Share capital deposit'),
        jsonb_build_object('account_id', _acct_share, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Share capital liability')
      );
    END IF;

  WHEN 'insurance_premium' THEN
    _result := jsonb_build_object('type', 'insurance_premium', 'amount', _tx.amount);
    _allocation := jsonb_build_object('insurance_premium', _tx.amount);
    IF _acct_ins_prem IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Insurance premium received'),
        jsonb_build_object('account_id', _acct_ins_prem, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Insurance premium income')
      );
    END IF;

  WHEN 'insurance_claim_payout' THEN
    _result := jsonb_build_object('type', 'insurance_claim_payout', 'amount', _tx.amount);
    _allocation := jsonb_build_object('insurance_payout', _tx.amount);
    IF _acct_ins_pay IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_ins_pay, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Insurance claim payout'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Cash paid for insurance claim')
      );
    END IF;

  WHEN 'adjustment_entry' THEN
    _result := jsonb_build_object('type', 'adjustment_entry', 'amount', _tx.amount);
    _allocation := jsonb_build_object('adjustment', _tx.amount);
    IF _acct_adj IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_adj, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'Adjustment entry'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'Adjustment cash')
      );
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.transaction_type;
  END CASE;

  -- ═══ GENERATE RUNNING BALANCE SNAPSHOT ═════════════════════
  _new_balance := jsonb_build_object(
    'loan_outstanding', COALESCE((SELECT outstanding_principal FROM public.loans WHERE id = _tx.account_id), 0),
    'savings_balance',  COALESCE((SELECT balance FROM public.savings_accounts WHERE id = _tx.account_id), 0)
  );

  -- ═══ CREATE RECEIPT SNAPSHOT ═══════════════════════════════
  UPDATE public.financial_transactions
  SET approval_status      = 'approved',
      approved_by          = _approver_id,
      approved_at          = now(),
      receipt_number       = _receipt,
      allocation_breakdown = _allocation,
      running_balance      = _new_balance,
      rejection_reason     = _reason,
      receipt_snapshot      = jsonb_build_object(
        'receipt_number', _receipt,
        'transaction_type', _tx.transaction_type,
        'amount', _tx.amount,
        'allocation', _allocation,
        'member_id', _tx.member_id,
        'member_name', COALESCE(_client.name_bn, _client.name_en, 'N/A'),
        'member_phone', COALESCE(_client.phone, ''),
        'approved_by', _approver_id,
        'approved_at', now(),
        'running_balance', _new_balance,
        'notes', COALESCE(_tx.notes, ''),
        'reference_id', COALESCE(_tx.reference_id, '')
      ),
      updated_at = now()
  WHERE id = _tx_id;

  -- ═══ WRITE V2 LEDGER ENTRIES ══════════════════════════════
  IF _ledger_entries IS NOT NULL AND jsonb_array_length(_ledger_entries) > 0 THEN
    _ledger_result := public.write_ledger_entries(
      _branch_id        := _main_branch_id,
      _reference_type   := 'financial_transaction',
      _reference_id     := _tx_id,
      _created_by       := _approver_id,
      _entries          := _ledger_entries
    );
  END IF;

  -- ═══ SMS LOG ═══════════════════════════════════════════════
  IF _client.phone IS NOT NULL AND length(trim(_client.phone)) > 0 THEN
    _sms_text := 'একতা ফাইন্যান্স: আপনার লেনদেন অনুমোদিত। রিসিপ্ট: ' || _receipt || ', পরিমাণ: ৳' || _tx.amount || ', ধরন: ' || _tx.transaction_type;
    INSERT INTO public.sms_logs (transaction_id, recipient_phone, recipient_name, message_text, message_type, status)
    VALUES (_tx_id, _client.phone, COALESCE(_client.name_bn, _client.name_en), _sms_text, 'transaction_approval', 'queued');
  END IF;

  -- ═══ AUDIT LOG ═════════════════════════════════════════════
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('approve_financial_transaction', 'financial_transaction', _tx_id, _approver_id,
    jsonb_build_object('receipt', _receipt, 'type', _tx.transaction_type, 'amount', _tx.amount, 'allocation', _allocation, 'reason', _reason, 'ledger', _ledger_result));

  RETURN jsonb_build_object(
    'receipt_number', _receipt,
    'allocation', _allocation,
    'running_balance', _new_balance,
    'ledger', _ledger_result
  );
END;
$$;

-- ═══ UPDATE approve_pending_transaction: Add feature flag bypass ═══
CREATE OR REPLACE FUNCTION public.approve_pending_transaction(
  _tx_id uuid,
  _reviewer_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _tx     RECORD;
  _result JSONB;
  _meta   JSONB;
  _maker_checker boolean := true;
BEGIN
  SELECT * INTO _tx FROM public.pending_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending transaction not found'; END IF;
  IF _tx.status != 'pending' THEN
    RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.status;
  END IF;

  -- ═══ FEATURE FLAG: Maker-Checker Validation ═══════════════
  -- To re-enable: UPDATE system_settings SET setting_value = '"true"' WHERE setting_key = 'maker_checker_enabled';
  SELECT COALESCE((setting_value #>> '{}')::boolean, true) INTO _maker_checker
  FROM public.system_settings WHERE setting_key = 'maker_checker_enabled';

  IF COALESCE(_maker_checker, true) AND _tx.submitted_by = _reviewer_id THEN
    RAISE EXCEPTION 'Cannot approve your own submission (Maker-Checker violation)';
  END IF;

  -- Apply based on type
  IF _tx.type IN ('loan_principal','loan_interest','loan_penalty','loan_repayment') THEN
    IF _tx.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan payment'; END IF;
    _result := public.apply_loan_payment(_tx.loan_id, _tx.amount, _tx.submitted_by, _tx.reference_id);
    PERFORM public.mark_schedule_payment(_tx.loan_id, _tx.amount, CURRENT_DATE);

  ELSIF _tx.type = 'loan_disbursement' THEN
    _meta := COALESCE(_tx.metadata, '{}'::jsonb);
    IF _meta->>'loan_product_id' IS NULL OR _meta->>'principal_amount' IS NULL THEN
      RAISE EXCEPTION 'metadata must contain loan_product_id and principal_amount for disbursement';
    END IF;
    _result := public.disburse_loan(
      _client_id         := _tx.client_id,
      _loan_product_id   := (_meta->>'loan_product_id')::UUID,
      _principal_amount  := (_meta->>'principal_amount')::NUMERIC,
      _disbursement_date := COALESCE(_meta->>'disbursement_date', CURRENT_DATE::TEXT),
      _assigned_officer  := _tx.submitted_by,
      _notes             := COALESCE(_tx.notes, ''),
      _loan_model        := COALESCE(_meta->>'loan_model', 'flat')
    );

  ELSIF _tx.type = 'savings_deposit' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings deposit'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_deposit', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance + _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type','savings_deposit','amount',_tx.amount,'savings_id',_tx.savings_id);

  ELSIF _tx.type = 'savings_withdrawal' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings withdrawal'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_withdrawal', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance - _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type','savings_withdrawal','amount',_tx.amount,'savings_id',_tx.savings_id);

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.type;
  END IF;

  -- Mark approved
  UPDATE public.pending_transactions
  SET status='approved', reviewed_by=_reviewer_id, review_reason=_reason, reviewed_at=now()
  WHERE id = _tx_id;

  -- Audit
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('approve_transaction','pending_transaction', _tx_id, _reviewer_id,
    jsonb_build_object('reference_id',_tx.reference_id,'amount',_tx.amount,'type',_tx.type,'result',_result,'reason',_reason));

  RETURN _result;
END;
$$;
