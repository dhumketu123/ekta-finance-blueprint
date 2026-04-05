
CREATE OR REPLACE FUNCTION public.approve_financial_transaction(
  _tx_id uuid,
  _approver_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
  _result          jsonb;
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
  _schedule_id     uuid;
BEGIN
  IF NOT public.has_role(_approver_id, 'admin') THEN
    RAISE EXCEPTION 'শুধুমাত্র অ্যাডমিন লেনদেন অনুমোদন করতে পারবেন';
  END IF;

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
  IF NOT FOUND THEN RAISE EXCEPTION 'লেনদেন পাওয়া যায়নি'; END IF;

  IF _tx.approval_status = 'approved' THEN
    RAISE EXCEPTION 'লেনদেন ইতোমধ্যে অনুমোদিত (রিসিপ্ট: %)', _tx.receipt_number;
  END IF;
  IF _tx.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'প্রত্যাখ্যাত লেনদেন অনুমোদন করা যাবে না';
  END IF;
  IF _tx.approval_status != 'pending' THEN
    RAISE EXCEPTION 'লেনদেনের অবস্থা অবৈধ: %', _tx.approval_status;
  END IF;

  SELECT COALESCE((setting_value #>> '{}')::boolean, true) INTO _maker_checker
  FROM public.system_settings WHERE setting_key = 'maker_checker_enabled';

  IF COALESCE(_maker_checker, true) AND _tx.created_by = _approver_id AND NOT public.has_role(_approver_id, 'admin') THEN
    RAISE EXCEPTION 'নিজের এন্ট্রি নিজে অনুমোদন করা যাবে না (Maker-Checker)';
  END IF;

  IF _tx.manual_flag AND (_reason IS NULL OR trim(_reason) = '') THEN
    RAISE EXCEPTION 'ম্যানুয়াল লেনদেনে অনুমোদনের কারণ আবশ্যক';
  END IF;

  IF _tx.transaction_type = 'adjustment_entry' AND NOT public.has_role(_approver_id, 'admin') THEN
    RAISE EXCEPTION 'সমন্বয় এন্ট্রি শুধুমাত্র অ্যাডমিন অনুমোদন করতে পারবেন';
  END IF;

  _receipt := public.generate_receipt_number();
  SELECT * INTO _client FROM public.clients WHERE id = _tx.member_id;

  CASE _tx.transaction_type

  WHEN 'loan_repayment' THEN
    SELECT * INTO _loan FROM public.loans
      WHERE id = _tx.account_id::uuid AND status IN ('active','overdue') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'সক্রিয় ঋণ পাওয়া যায়নি'; END IF;

    _remaining := _tx.amount;
    IF _loan.penalty_amount > 0 THEN
      _penalty_paid := LEAST(_remaining, _loan.penalty_amount);
      _remaining := _remaining - _penalty_paid;
    END IF;
    IF _loan.outstanding_interest > 0 THEN
      _interest_paid := LEAST(_remaining, _loan.outstanding_interest);
      _remaining := _remaining - _interest_paid;
    END IF;
    IF _loan.outstanding_principal > 0 THEN
      _principal_paid := LEAST(_remaining, _loan.outstanding_principal);
      _remaining := _remaining - _principal_paid;
    END IF;

    _allocation := jsonb_build_object(
      'penalty_paid', _penalty_paid, 'interest_paid', _interest_paid,
      'principal_paid', _principal_paid, 'overpayment', _remaining
    );

    UPDATE public.loans SET
      outstanding_principal = outstanding_principal - _principal_paid,
      outstanding_interest  = outstanding_interest  - _interest_paid,
      penalty_amount        = penalty_amount        - _penalty_paid,
      status = CASE WHEN (outstanding_principal - _principal_paid) <= 0 THEN 'completed'::loan_status ELSE status END,
      updated_at = now()
    WHERE id = _loan.id;

    SELECT id INTO _schedule_id FROM public.loan_schedules
      WHERE loan_id = _loan.id AND status IN ('pending','overdue')
      ORDER BY due_date ASC LIMIT 1;
    IF _schedule_id IS NOT NULL THEN
      UPDATE public.loan_schedules SET
        principal_paid = principal_paid + _principal_paid,
        interest_paid  = interest_paid  + _interest_paid,
        paid_date = CURRENT_DATE, status = 'paid', updated_at = now()
      WHERE id = _schedule_id;
    END IF;

    _new_balance := jsonb_build_object(
      'outstanding_principal', _loan.outstanding_principal - _principal_paid,
      'outstanding_interest',  _loan.outstanding_interest  - _interest_paid,
      'penalty_amount',        _loan.penalty_amount        - _penalty_paid
    );

    _ledger_entries := '[]'::jsonb;
    IF _principal_paid > 0 AND _acct_loan_prin IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _principal_paid, 'narration', 'মূলধন আদায়'),
        jsonb_build_object('account_id', _acct_loan_prin, 'entry_type', 'credit', 'amount', _principal_paid, 'narration', 'মূলধন আদায়')
      );
    END IF;
    IF _interest_paid > 0 AND _acct_loan_int IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _interest_paid, 'narration', 'সুদ আদায়'),
        jsonb_build_object('account_id', _acct_loan_int, 'entry_type', 'credit', 'amount', _interest_paid, 'narration', 'সুদ আদায়')
      );
    END IF;
    IF _penalty_paid > 0 AND _acct_penalty IS NOT NULL THEN
      _ledger_entries := _ledger_entries || jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _penalty_paid, 'narration', 'জরিমানা আদায়'),
        jsonb_build_object('account_id', _acct_penalty, 'entry_type', 'credit', 'amount', _penalty_paid, 'narration', 'জরিমানা আদায়')
      );
    END IF;

  WHEN 'savings_deposit' THEN
    UPDATE public.savings_accounts SET balance = balance + _tx.amount, updated_at = now()
      WHERE id = _tx.account_id::uuid;
    _allocation := jsonb_build_object('savings_credited', _tx.amount);
    _new_balance := (SELECT jsonb_build_object('savings_balance', balance) FROM public.savings_accounts WHERE id = _tx.account_id::uuid);
    IF _acct_savings IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'সঞ্চয় জমা'),
        jsonb_build_object('account_id', _acct_savings, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'সঞ্চয় দায়')
      );
    END IF;

  WHEN 'savings_withdrawal' THEN
    UPDATE public.savings_accounts SET balance = balance - _tx.amount, updated_at = now()
      WHERE id = _tx.account_id::uuid AND balance >= _tx.amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'সঞ্চয়ে পর্যাপ্ত ব্যালেন্স নেই'; END IF;
    _allocation := jsonb_build_object('savings_debited', _tx.amount);
    _new_balance := (SELECT jsonb_build_object('savings_balance', balance) FROM public.savings_accounts WHERE id = _tx.account_id::uuid);
    IF _acct_savings IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_savings, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'সঞ্চয় উত্তোলন'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'সঞ্চয় উত্তোলন')
      );
    END IF;

  WHEN 'loan_disbursement' THEN
    _allocation := jsonb_build_object('disbursed', _tx.amount);
    _new_balance := '{}'::jsonb;
    IF _acct_disb IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_disb, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'ঋণ বিতরণ'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'ঋণ বিতরণ')
      );
    END IF;

  WHEN 'admission_fee' THEN
    _allocation := jsonb_build_object('fee_collected', _tx.amount);
    _new_balance := '{}'::jsonb;
    IF _acct_adm_fee IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'ভর্তি ফি আদায়'),
        jsonb_build_object('account_id', _acct_adm_fee, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'ভর্তি ফি আয়')
      );
    END IF;

  WHEN 'share_capital_deposit' THEN
    _allocation := jsonb_build_object('share_capital', _tx.amount);
    _new_balance := '{}'::jsonb;
    IF _acct_share IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'শেয়ার মূলধন জমা'),
        jsonb_build_object('account_id', _acct_share, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'শেয়ার মূলধন')
      );
    END IF;

  WHEN 'insurance_premium' THEN
    _allocation := jsonb_build_object('premium_collected', _tx.amount);
    _new_balance := '{}'::jsonb;
    IF _acct_ins_prem IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'বীমা প্রিমিয়াম আদায়'),
        jsonb_build_object('account_id', _acct_ins_prem, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'বীমা প্রিমিয়াম আয়')
      );
    END IF;

  WHEN 'insurance_claim_payout' THEN
    _allocation := jsonb_build_object('claim_paid', _tx.amount);
    _new_balance := '{}'::jsonb;
    IF _acct_ins_pay IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_ins_pay, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'বীমা দাবি পরিশোধ'),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'বীমা দাবি পরিশোধ')
      );
    END IF;

  WHEN 'adjustment_entry' THEN
    _allocation := jsonb_build_object('adjusted', _tx.amount, 'reason', COALESCE(_reason, 'N/A'));
    _new_balance := '{}'::jsonb;
    IF _acct_adj IS NOT NULL THEN
      _ledger_entries := jsonb_build_array(
        jsonb_build_object('account_id', _acct_adj, 'entry_type', 'debit', 'amount', _tx.amount, 'narration', 'সমন্বয় এন্ট্রি: ' || COALESCE(_reason, '')),
        jsonb_build_object('account_id', _acct_cash, 'entry_type', 'credit', 'amount', _tx.amount, 'narration', 'সমন্বয় এন্ট্রি')
      );
    END IF;

  ELSE
    RAISE EXCEPTION 'অজানা লেনদেনের ধরন: %', _tx.transaction_type;
  END CASE;

  _result := jsonb_build_object(
    'receipt_number', _receipt, 'transaction_type', _tx.transaction_type,
    'amount', _tx.amount,
    'client_name', COALESCE(_client.name_bn, _client.name_en, 'N/A'),
    'client_member_id', _client.member_id,
    'allocation', _allocation, 'balance_after', _new_balance,
    'approved_by', _approver_id, 'approved_at', now(),
    'approval_reason', COALESCE(_reason, '')
  );

  UPDATE public.financial_transactions SET
    approval_status = 'approved', approved_by = _approver_id, approved_at = now(),
    receipt_number = _receipt, allocation_breakdown = _allocation,
    running_balance = _new_balance, receipt_snapshot = _result,
    notes = COALESCE(notes || ' | ' || _reason, notes), updated_at = now()
  WHERE id = _tx_id;

  IF _ledger_entries IS NOT NULL AND jsonb_array_length(COALESCE(_ledger_entries, '[]'::jsonb)) > 0 THEN
    DECLARE
      _entry jsonb;
      _group_id uuid := gen_random_uuid();
    BEGIN
      FOR _entry IN SELECT * FROM jsonb_array_elements(_ledger_entries) LOOP
        INSERT INTO public.ledger_entries (
          transaction_group_id, branch_id, account_id, account_type,
          entry_type, amount, reference_type, reference_id, narration, created_by
        ) VALUES (
          _group_id, _main_branch_id,
          (_entry->>'account_id')::uuid,
          (SELECT account_type::text FROM public.accounts WHERE id = (_entry->>'account_id')::uuid),
          (_entry->>'entry_type')::entry_type,
          (_entry->>'amount')::numeric,
          'financial_transaction', _tx_id,
          _entry->>'narration', _approver_id
        );
      END LOOP;
    END;
  END IF;

  RETURN _result;
END;
$$;
