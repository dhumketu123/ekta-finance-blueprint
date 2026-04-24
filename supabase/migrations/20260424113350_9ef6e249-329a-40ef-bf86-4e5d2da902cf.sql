-- =============================================================================
-- BANK-GRADE POSTING ENGINE v1
-- Wires double-entry ledger to disbursement & repayment events
-- =============================================================================

-- -----------------------------------------------------------------------------
-- HELPER 1: post_loan_disbursement_event
-- Posts: DR Loan Principal Receivable / CR Cash on Hand
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_loan_disbursement_event(
  _tenant_id uuid,
  _loan_id   uuid,
  _amount    numeric,
  _actor     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cash_acct uuid;
  _recv_acct uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN;
  END IF;

  SELECT id INTO _cash_acct
  FROM public.accounts
  WHERE account_code = 'CASH_ON_HAND' AND is_active = true
  LIMIT 1;

  SELECT id INTO _recv_acct
  FROM public.accounts
  WHERE account_code = 'LOAN_PRINCIPAL' AND is_active = true
  LIMIT 1;

  IF _cash_acct IS NULL OR _recv_acct IS NULL THEN
    RAISE EXCEPTION 'posting_engine: required system accounts missing (CASH_ON_HAND/LOAN_PRINCIPAL)';
  END IF;

  -- DR Loan Receivable, CR Cash
  PERFORM public.post_double_entry_event(
    _tenant_id,
    'loan_disbursement',
    _loan_id,
    _recv_acct,           -- debit: asset increases
    _cash_acct,           -- credit: cash decreases
    _amount,
    jsonb_build_object('loan_id', _loan_id, 'source', 'disburse_loan'),
    _actor
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- HELPER 2: post_loan_repayment_event
-- Posts split entries for principal, interest, penalty
--   Principal:  DR Cash / CR Loan Principal Receivable
--   Interest:   DR Cash / CR Loan Interest Income
--   Penalty:    DR Cash / CR Penalty Income
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_loan_repayment_event(
  _tenant_id     uuid,
  _loan_id       uuid,
  _ft_id         uuid,
  _principal     numeric,
  _interest      numeric,
  _penalty       numeric,
  _actor         uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cash_acct        uuid;
  _principal_acct   uuid;
  _interest_acct    uuid;
  _penalty_acct     uuid;
BEGIN
  SELECT id INTO _cash_acct       FROM public.accounts WHERE account_code = 'CASH_ON_HAND'    AND is_active LIMIT 1;
  SELECT id INTO _principal_acct  FROM public.accounts WHERE account_code = 'LOAN_PRINCIPAL'  AND is_active LIMIT 1;
  SELECT id INTO _interest_acct   FROM public.accounts WHERE account_code = 'LOAN_INTEREST'   AND is_active LIMIT 1;
  SELECT id INTO _penalty_acct    FROM public.accounts WHERE account_code = 'PENALTY_INCOME'  AND is_active LIMIT 1;

  IF _cash_acct IS NULL OR _principal_acct IS NULL OR _interest_acct IS NULL OR _penalty_acct IS NULL THEN
    RAISE EXCEPTION 'posting_engine: required system accounts missing for repayment';
  END IF;

  -- Principal leg: DR Cash, CR Loan Receivable
  IF COALESCE(_principal, 0) > 0 THEN
    PERFORM public.post_double_entry_event(
      _tenant_id,
      'loan_repayment_principal',
      _ft_id,
      _cash_acct,
      _principal_acct,
      _principal,
      jsonb_build_object('loan_id', _loan_id, 'leg', 'principal'),
      _actor
    );
  END IF;

  -- Interest leg: DR Cash, CR Interest Income
  IF COALESCE(_interest, 0) > 0 THEN
    PERFORM public.post_double_entry_event(
      _tenant_id,
      'loan_repayment_interest',
      _ft_id,
      _cash_acct,
      _interest_acct,
      _interest,
      jsonb_build_object('loan_id', _loan_id, 'leg', 'interest'),
      _actor
    );
  END IF;

  -- Penalty leg: DR Cash, CR Penalty Income
  IF COALESCE(_penalty, 0) > 0 THEN
    PERFORM public.post_double_entry_event(
      _tenant_id,
      'loan_repayment_penalty',
      _ft_id,
      _cash_acct,
      _penalty_acct,
      _penalty,
      jsonb_build_object('loan_id', _loan_id, 'leg', 'penalty'),
      _actor
    );
  END IF;
END;
$$;

-- =============================================================================
-- PATCH disburse_loan — append posting call (preserve all existing logic)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.disburse_loan(
  _client_id uuid, _loan_product_id uuid, _principal_amount numeric,
  _disbursement_date date, _assigned_officer uuid DEFAULT NULL::uuid,
  _notes text DEFAULT NULL::text, _loan_model text DEFAULT 'flat'::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user           uuid := auth.uid();
  _tenant         uuid;
  _user_tenant    uuid;
  _product        RECORD;
  _client         RECORD;
  _loan_id        uuid;
  _loan_row       RECORD;
  _total_interest numeric;
  _total_owed     numeric;
  _emi            numeric;
  _maturity_date  date;
  _loan_ref       text;
  _active_count   integer;
  _first_due_date date;
  _result         jsonb;
  _post_err       text;
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT * INTO _client FROM public.clients WHERE id = _client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  _tenant := _client.tenant_id;

  SELECT tenant_id INTO _user_tenant FROM public.profiles WHERE id = _user;
  IF _user_tenant IS DISTINCT FROM _tenant THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND role = 'super_admin') THEN
      RAISE EXCEPTION 'Access denied: tenant mismatch';
    END IF;
  END IF;

  SELECT * INTO _product FROM public.loan_products WHERE id = _loan_product_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan product not found'; END IF;

  IF _principal_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF _principal_amount < _product.min_amount THEN RAISE EXCEPTION 'Amount below minimum limit'; END IF;
  IF _principal_amount > _product.max_amount THEN RAISE EXCEPTION 'Amount exceeds maximum limit'; END IF;

  SELECT COUNT(*) INTO _active_count FROM public.loans WHERE client_id = _client_id AND status = 'active' AND deleted_at IS NULL;
  IF _active_count >= _product.max_concurrent THEN RAISE EXCEPTION 'Max active loans reached'; END IF;

  IF _product.payment_type = 'bullet' THEN
    _total_interest := ROUND(_principal_amount * _product.interest_rate / 100 * _product.tenure_months / 12, 2);
    _emi := _principal_amount + _total_interest;
  ELSIF _product.payment_type = 'monthly_profit' THEN
    _total_interest := ROUND(_principal_amount * _product.interest_rate / 100 * _product.tenure_months, 2);
    _emi := ROUND(_principal_amount * _product.interest_rate / 100, 2);
  ELSIF _loan_model = 'reducing' THEN
    DECLARE
      _r numeric := _product.interest_rate / 100 / 12;
      _n integer := _product.tenure_months;
    BEGIN
      IF _r <= 0 THEN
        _emi := ROUND(_principal_amount / _n, 2);
        _total_interest := 0;
      ELSE
        _emi := ROUND(_principal_amount * _r * POWER(1 + _r, _n) / (POWER(1 + _r, _n) - 1), 2);
        _total_interest := ROUND(_emi * _n - _principal_amount, 2);
      END IF;
    END;
  ELSE
    _total_interest := ROUND(_principal_amount * _product.interest_rate / 100, 2);
    _emi := ROUND((_principal_amount + _total_interest) / _product.tenure_months, 2);
  END IF;

  _total_owed := _principal_amount + _total_interest;

  IF _product.payment_type = 'weekly' THEN
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' weeks')::interval)::date;
  ELSE
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' months')::interval)::date;
  END IF;

  INSERT INTO public.loans (
    client_id, loan_product_id, assigned_officer,
    total_principal, total_interest,
    outstanding_principal, outstanding_interest,
    penalty_amount, emi_amount,
    loan_model, disbursement_date, maturity_date,
    status, notes,
    installment_day, installment_anchor_date,
    tenant_id
  ) VALUES (
    _client_id, _loan_product_id, COALESCE(_assigned_officer, _user),
    _principal_amount, _total_interest,
    _principal_amount, _total_interest,
    0, _emi,
    _loan_model::loan_model, _disbursement_date, _maturity_date,
    'active', _notes,
    LEAST(EXTRACT(DAY FROM _disbursement_date)::integer, 28),
    _disbursement_date,
    _tenant
  ) RETURNING * INTO _loan_row;

  _loan_id  := _loan_row.id;
  _loan_ref := COALESCE(_loan_row.loan_id, _loan_id::text);

  INSERT INTO public.transactions (
    loan_id, client_id, type, amount,
    transaction_date, status, performed_by,
    reference_id, notes
  ) VALUES (
    _loan_id, _client_id, 'loan_disbursement', _principal_amount,
    _disbursement_date, 'paid', COALESCE(_assigned_officer, _user),
    'DISB-' || _loan_ref,
    'Loan Disbursement - ' || COALESCE(_product.product_name_en, _product.product_name_bn)
  );

  PERFORM public.generate_loan_schedule(
    _loan_id, _client_id,
    _principal_amount, _product.interest_rate,
    _product.tenure_months, _product.payment_type::text,
    _loan_model, _disbursement_date
  );

  SELECT MIN(due_date) INTO _first_due_date
  FROM public.loan_schedules
  WHERE loan_id = _loan_id AND status = 'pending';

  UPDATE public.loans
  SET next_due_date = _first_due_date, updated_at = now()
  WHERE id = _loan_id;

  UPDATE public.clients
  SET status = 'active',
      loan_amount = _principal_amount,
      loan_product_id = _loan_product_id,
      next_payment_date = _first_due_date,
      updated_at = now()
  WHERE id = _client_id;

  -- ============================================================
  -- BANK-GRADE POSTING ENGINE — write double-entry ledger
  -- Non-blocking: failure logged to audit, transaction continues
  -- ============================================================
  BEGIN
    PERFORM public.post_loan_disbursement_event(
      _tenant, _loan_id, _principal_amount, _user
    );
  EXCEPTION WHEN OTHERS THEN
    _post_err := SQLERRM;
    INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action_type, details)
    VALUES (_user, 'posting_engine', _loan_id, 'ledger_post_failed',
            jsonb_build_object('event', 'loan_disbursement', 'error', _post_err, 'amount', _principal_amount));
  END;

  INSERT INTO public.audit_logs (
    user_id, entity_type, entity_id, action_type, details
  ) VALUES (
    _user, 'loan', _loan_id, 'loan_disbursement',
    jsonb_build_object(
      'client_id', _client_id,
      'principal', _principal_amount,
      'interest', _total_interest,
      'emi', _emi,
      'product_id', _loan_product_id,
      'model', _loan_model,
      'maturity_date', _maturity_date
    )
  );

  _result := jsonb_build_object(
    'success', true,
    'loan_id', _loan_id,
    'loan_ref', _loan_ref,
    'principal', _principal_amount,
    'interest', _total_interest,
    'emi', _emi,
    'maturity_date', _maturity_date
  );
  RETURN _result;
END;
$function$;

-- =============================================================================
-- PATCH apply_loan_payment — append posting call after FT insert
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id uuid, _amount numeric, _performed_by uuid, _reference_id text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _loan record;
  _dps_due numeric := 0;
  _dps_paid numeric := 0;
  _savings_account_id uuid;
  _penalty_paid numeric := 0;
  _interest_paid numeric := 0;
  _principal_paid numeric := 0;
  _remaining numeric;
  _total_outstanding numeric;
  _total_payable numeric;
  _new_next_due date;
  _sched record;
  _sched_int_alloc numeric;
  _sched_pri_alloc numeric;
  _alloc_remaining numeric;
  _ft_id uuid;
  _loan_should_close boolean;
  _receipt_num text;
  _result jsonb;
  _base_points integer;
  _points_earned integer;
  _current_score integer;
  _new_score integer;
  _new_tier text;
  _post_err text;
BEGIN
  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ঋণ খুঁজে পাওয়া যায়নি (Loan not found)'; END IF;

  IF _loan.status = 'closed' AND (_loan.outstanding_principal + _loan.outstanding_interest + _loan.penalty_amount) > 0 THEN
    UPDATE public.loans SET status = 'active'::loan_status, updated_at = now() WHERE id = _loan_id;
    _loan.status := 'active';
  END IF;

  IF _loan.status NOT IN ('active', 'default') THEN
    RAISE EXCEPTION 'এই ঋণে পেমেন্ট গ্রহণযোগ্য নয়। শুধুমাত্র সক্রিয়/বকেয়া ঋণে পেমেন্ট নেওয়া যায়।';
  END IF;

  _total_outstanding := _loan.outstanding_principal + _loan.outstanding_interest + _loan.penalty_amount;

  IF _loan.loan_product_id IS NOT NULL THEN
    SELECT COALESCE(compulsory_savings_amount, 0) INTO _dps_due FROM public.loan_products WHERE id = _loan.loan_product_id;
  END IF;
  _dps_due := COALESCE(_dps_due, 0);
  _total_payable := _total_outstanding + _dps_due;

  IF _amount > _total_payable THEN
    RAISE EXCEPTION 'অতিরিক্ত পরিশোধ: প্রদত্ত পরিমাণ (৳%) সর্বোচ্চ পরিশোধযোগ্য পরিমাণ (৳%) অতিক্রম করেছে। অনুগ্রহ করে সঠিক পরিমাণ প্রদান করুন।', _amount, _total_payable;
  END IF;

  _remaining := _amount;
  _receipt_num := 'RCP-' || to_char(now(), 'YYYYMMDD-HH24MISS-MS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transactions WHERE reference_id = _reference_id) OR
       EXISTS (SELECT 1 FROM public.financial_transactions WHERE reference_id = _reference_id) THEN
      RAISE EXCEPTION 'ডুপ্লিকেট রেফারেন্স: এই রেফারেন্স নম্বরে ইতোমধ্যে একটি লেনদেন বিদ্যমান। অনুগ্রহ করে একটি ইউনিক রেফারেন্স ব্যবহার করুন।';
    END IF;
  END IF;

  IF _dps_due > 0 AND _remaining > 0 THEN
    _dps_paid := LEAST(_remaining, _dps_due);
    _remaining := _remaining - _dps_paid;

    SELECT id INTO _savings_account_id FROM public.savings_accounts
    WHERE client_id = _loan.client_id AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;

    IF _savings_account_id IS NULL THEN
      RAISE EXCEPTION 'সতর্কতা: গ্রাহকের কোনো সক্রিয় সঞ্চয় অ্যাকাউন্ট নেই। বাধ্যতামূলক সঞ্চয় জমা দেওয়ার জন্য প্রথমে একটি সঞ্চয় অ্যাকাউন্ট খুলুন।';
    END IF;

    UPDATE public.savings_accounts SET balance = balance + _dps_paid, updated_at = now() WHERE id = _savings_account_id;

    INSERT INTO public.financial_transactions (member_id, account_id, transaction_type, amount, created_by, approval_status, reference_id, notes, receipt_number)
    VALUES (_loan.client_id, _savings_account_id, 'savings_deposit', _dps_paid, _performed_by, 'approved', _reference_id, 'স্বয়ংক্রিয় বাধ্যতামূলক সঞ্চয় (DPS) — ঋণের কিস্তি থেকে কর্তন', _receipt_num || '-DPS');
  END IF;

  IF _remaining <= 0 THEN
    RETURN jsonb_build_object('success', true, 'dps_collected', _dps_paid, 'total_payment', 0, 'penalty_paid', 0, 'interest_paid', 0, 'principal_paid', 0, 'new_outstanding', _total_outstanding, 'loan_closed', false);
  END IF;

  IF _remaining > 0 AND _loan.penalty_amount > 0 THEN
    _penalty_paid := LEAST(_remaining, _loan.penalty_amount);
    _remaining := _remaining - _penalty_paid;
  END IF;

  IF _remaining > 0 AND _loan.outstanding_interest > 0 THEN
    _interest_paid := LEAST(_remaining, _loan.outstanding_interest);
    _remaining := _remaining - _interest_paid;
  END IF;

  IF _remaining > 0 AND _loan.outstanding_principal > 0 THEN
    _principal_paid := LEAST(_remaining, _loan.outstanding_principal);
    _remaining := _remaining - _principal_paid;
  END IF;

  _loan_should_close := ((_total_outstanding - (_penalty_paid + _interest_paid + _principal_paid)) <= 0);

  IF _loan_should_close THEN _new_next_due := NULL;
  ELSE
    SELECT MIN(due_date) INTO _new_next_due FROM public.loan_schedules WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');
  END IF;

  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    next_due_date = _new_next_due,
    updated_at = now()
  WHERE id = _loan_id;

  _alloc_remaining := _interest_paid + _principal_paid;
  FOR _sched IN
    SELECT * FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue')
    ORDER BY installment_number ASC
  LOOP
    EXIT WHEN _alloc_remaining <= 0;
    _sched_int_alloc := LEAST(_alloc_remaining, GREATEST(0, _sched.interest_due - _sched.interest_paid));
    _alloc_remaining := _alloc_remaining - _sched_int_alloc;
    _sched_pri_alloc := LEAST(_alloc_remaining, GREATEST(0, _sched.principal_due - _sched.principal_paid));
    _alloc_remaining := _alloc_remaining - _sched_pri_alloc;

    UPDATE public.loan_schedules SET
      interest_paid = interest_paid + _sched_int_alloc,
      principal_paid = principal_paid + _sched_pri_alloc,
      status = CASE WHEN (interest_paid + _sched_int_alloc) >= interest_due AND (principal_paid + _sched_pri_alloc) >= principal_due THEN 'paid' WHEN (interest_paid + _sched_int_alloc + principal_paid + _sched_pri_alloc) > 0 THEN 'partial' ELSE status END,
      paid_date = CASE WHEN (interest_paid + _sched_int_alloc) >= interest_due AND (principal_paid + _sched_pri_alloc) >= principal_due THEN CURRENT_DATE ELSE paid_date END,
      updated_at = now()
    WHERE id = _sched.id;
  END LOOP;

  INSERT INTO public.financial_transactions (member_id, account_id, transaction_type, amount, created_by, approval_status, reference_id, notes, allocation_breakdown, receipt_number)
  VALUES (_loan.client_id, _loan_id, 'loan_repayment', (_penalty_paid + _interest_paid + _principal_paid), _performed_by, 'approved', _reference_id, 'কিস্তি পরিশোধ', jsonb_build_object('penalty', _penalty_paid, 'interest', _interest_paid, 'principal', _principal_paid, 'dps_auto_deducted', _dps_paid), _receipt_num) RETURNING id INTO _ft_id;

  -- ============================================================
  -- BANK-GRADE POSTING ENGINE — write double-entry ledger
  -- Non-blocking: failure logged to audit, transaction continues
  -- ============================================================
  BEGIN
    PERFORM public.post_loan_repayment_event(
      _loan.tenant_id, _loan_id, _ft_id,
      _principal_paid, _interest_paid, _penalty_paid,
      _performed_by
    );
  EXCEPTION WHEN OTHERS THEN
    _post_err := SQLERRM;
    INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action_type, details)
    VALUES (_performed_by, 'posting_engine', _ft_id, 'ledger_post_failed',
            jsonb_build_object('event', 'loan_repayment', 'error', _post_err,
                               'principal', _principal_paid, 'interest', _interest_paid, 'penalty', _penalty_paid));
  END;

  IF _loan_should_close THEN UPDATE public.loans SET status = 'closed'::loan_status, updated_at = now() WHERE id = _loan_id; END IF;

  UPDATE public.clients SET next_payment_date = _new_next_due, updated_at = now() WHERE id = _loan.client_id;

  _base_points := FLOOR((_principal_paid + _interest_paid) / 1000);

  IF _penalty_paid > 0 THEN
    _points_earned := -(_base_points * 2);
  ELSE
    _points_earned := _base_points + 2;
  END IF;

  IF _loan_should_close AND _penalty_paid = 0 AND (_loan.penalty_amount - _penalty_paid) <= 0 THEN
    _points_earned := _points_earned + 200;
  END IF;

  SELECT COALESCE(trust_score, 0) INTO _current_score FROM public.clients WHERE id = _loan.client_id;
  _new_score := GREATEST(0, _current_score + _points_earned);

  IF _new_score >= 10000 THEN _new_tier := 'Platinum';
  ELSIF _new_score >= 5000 THEN _new_tier := 'Gold';
  ELSIF _new_score >= 2000 THEN _new_tier := 'Silver';
  ELSE _new_tier := 'Standard';
  END IF;

  UPDATE public.clients SET trust_score = _new_score, trust_tier = _new_tier, updated_at = now() WHERE id = _loan.client_id;

  _result := jsonb_build_object(
    'success', true,
    'dps_collected', _dps_paid,
    'total_payment', (_penalty_paid + _interest_paid + _principal_paid),
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'remaining_balance', GREATEST(0, _total_outstanding - (_penalty_paid + _interest_paid + _principal_paid)),
    'new_outstanding', GREATEST(0, _total_outstanding - (_penalty_paid + _interest_paid + _principal_paid)),
    'loan_closed', _loan_should_close,
    'ft_id', _ft_id,
    'points_earned', _points_earned,
    'new_score', _new_score,
    'new_tier', _new_tier
  );

  RETURN _result;
END;
$function$;

-- Permissions
REVOKE ALL ON FUNCTION public.post_loan_disbursement_event(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_loan_repayment_event(uuid, uuid, uuid, numeric, numeric, numeric, uuid) FROM PUBLIC;