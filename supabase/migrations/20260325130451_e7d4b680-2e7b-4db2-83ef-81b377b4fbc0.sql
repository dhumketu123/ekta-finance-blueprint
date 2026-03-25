
CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id uuid,
  _amount numeric,
  _performed_by uuid,
  _reference_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loan RECORD;
  _total_outstanding NUMERIC;
  _remaining NUMERIC;
  _penalty_paid NUMERIC := 0;
  _interest_paid NUMERIC := 0;
  _principal_paid NUMERIC := 0;
  _new_next_due date;
  _result JSONB;
  _sched RECORD;
  _alloc_remaining NUMERIC;
  _sched_int_alloc NUMERIC;
  _sched_pri_alloc NUMERIC;
  _ft_id uuid;
  _loan_should_close BOOLEAN := false;
BEGIN
  -- Duplicate reference check
  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transactions WHERE reference_id = _reference_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Duplicate reference_id: %', _reference_id;
    END IF;
  END IF;

  -- Lock the loan row
  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  -- AUTO-REPAIR: If loan is closed but has outstanding balance, reopen atomically
  IF _loan.status = 'closed' THEN
    IF (_loan.outstanding_principal + _loan.outstanding_interest + _loan.penalty_amount) > 0 THEN
      UPDATE public.loans SET status = 'active', updated_at = now() WHERE id = _loan_id;
      SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'Cannot accept payment on a fully closed loan';
    END IF;
  END IF;

  _total_outstanding := _loan.penalty_amount + _loan.outstanding_interest + _loan.outstanding_principal;
  IF _amount > _total_outstanding THEN
    RAISE EXCEPTION 'Payment ৳% exceeds outstanding ৳%', _amount, _total_outstanding;
  END IF;

  _remaining := _amount;

  -- Waterfall: Penalty -> Interest -> Principal
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

  -- Determine if loan should close
  _loan_should_close := ((_total_outstanding - _amount) <= 0);

  IF _loan_should_close THEN
    _new_next_due := NULL;
  ELSE
    SELECT MIN(due_date) INTO _new_next_due
    FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');
  END IF;

  -- PHASE 1: Update balances ONLY (keep status active so trigger won't block transactions)
  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    next_due_date = _new_next_due,
    updated_at = now()
  WHERE id = _loan_id;

  -- PHASE 2: Insert transaction records (loan is still 'active', trigger won't block)
  IF _penalty_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_penalty', _penalty_paid, CURRENT_DATE, 'paid', _performed_by, _reference_id, 'Penalty payment');
  END IF;

  IF _interest_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_interest', _interest_paid, CURRENT_DATE, 'paid', _performed_by, NULL, 'Interest payment');
  END IF;

  IF _principal_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_principal', _principal_paid, CURRENT_DATE, 'paid', _performed_by, NULL, 'Principal payment');
  END IF;

  -- PHASE 3: Allocate to loan schedules
  _alloc_remaining := _amount;
  FOR _sched IN
    SELECT * FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue')
    ORDER BY installment_number ASC
  LOOP
    EXIT WHEN _alloc_remaining <= 0;

    _sched_int_alloc := LEAST(_alloc_remaining, _sched.interest_due - _sched.interest_paid);
    IF _sched_int_alloc < 0 THEN _sched_int_alloc := 0; END IF;
    _alloc_remaining := _alloc_remaining - _sched_int_alloc;

    _sched_pri_alloc := LEAST(_alloc_remaining, _sched.principal_due - _sched.principal_paid);
    IF _sched_pri_alloc < 0 THEN _sched_pri_alloc := 0; END IF;
    _alloc_remaining := _alloc_remaining - _sched_pri_alloc;

    UPDATE public.loan_schedules SET
      interest_paid = interest_paid + _sched_int_alloc,
      principal_paid = principal_paid + _sched_pri_alloc,
      status = CASE
        WHEN (interest_paid + _sched_int_alloc) >= interest_due AND (principal_paid + _sched_pri_alloc) >= principal_due THEN 'paid'
        WHEN (interest_paid + _sched_int_alloc + principal_paid + _sched_pri_alloc) > 0 THEN 'partial'
        ELSE status
      END,
      paid_date = CASE
        WHEN (interest_paid + _sched_int_alloc) >= interest_due AND (principal_paid + _sched_pri_alloc) >= principal_due THEN CURRENT_DATE
        ELSE paid_date
      END,
      updated_at = now()
    WHERE id = _sched.id;
  END LOOP;

  -- PHASE 4: Insert financial_transactions record
  INSERT INTO public.financial_transactions (
    member_id, account_id, transaction_type, amount, created_by, approval_status, reference_id, notes,
    allocation_breakdown, receipt_number
  ) VALUES (
    _loan.client_id, _loan_id, 'loan_repayment', _amount, _performed_by, 'approved', _reference_id,
    'কিস্তি পরিশোধ',
    jsonb_build_object('penalty', _penalty_paid, 'interest', _interest_paid, 'principal', _principal_paid),
    'RCP-' || to_char(now(), 'YYYYMMDD-HH24MISS')
  ) RETURNING id INTO _ft_id;

  -- PHASE 5: NOW set loan status to closed (after all inserts are done)
  IF _loan_should_close THEN
    UPDATE public.loans SET status = 'closed'::loan_status, updated_at = now() WHERE id = _loan_id;
  END IF;

  -- Update client next_payment_date
  UPDATE public.clients SET
    next_payment_date = _new_next_due,
    updated_at = now()
  WHERE id = _loan.client_id;

  _result := jsonb_build_object(
    'success', true,
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'remaining_balance', (_total_outstanding - _amount),
    'loan_closed', _loan_should_close,
    'ft_id', _ft_id
  );

  RETURN _result;
END;
$$;
