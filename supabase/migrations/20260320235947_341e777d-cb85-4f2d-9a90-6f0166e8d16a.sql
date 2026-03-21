
-- Upgrade apply_loan_payment to also update loan_schedules and create financial_transactions record
CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id uuid,
  _amount numeric,
  _performed_by uuid DEFAULT NULL,
  _reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
BEGIN
  -- Duplicate reference check
  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transactions WHERE reference_id = _reference_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Duplicate reference_id: %', _reference_id;
    END IF;
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  IF _loan.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot accept payment on a closed loan';
  END IF;

  _total_outstanding := _loan.penalty_amount + _loan.outstanding_interest + _loan.outstanding_principal;
  IF _amount > _total_outstanding THEN
    RAISE EXCEPTION 'Payment ৳% exceeds outstanding ৳%', _amount, _total_outstanding;
  END IF;

  _remaining := _amount;

  -- Priority 1: Penalty
  IF _remaining > 0 AND _loan.penalty_amount > 0 THEN
    _penalty_paid := LEAST(_remaining, _loan.penalty_amount);
    _remaining := _remaining - _penalty_paid;
  END IF;

  -- Priority 2: Interest
  IF _remaining > 0 AND _loan.outstanding_interest > 0 THEN
    _interest_paid := LEAST(_remaining, _loan.outstanding_interest);
    _remaining := _remaining - _interest_paid;
  END IF;

  -- Priority 3: Principal
  IF _remaining > 0 AND _loan.outstanding_principal > 0 THEN
    _principal_paid := LEAST(_remaining, _loan.outstanding_principal);
    _remaining := _remaining - _principal_paid;
  END IF;

  -- ★ Calculate next_due_date
  IF (_total_outstanding - _amount) <= 0 THEN
    _new_next_due := NULL;
  ELSE
    SELECT MIN(due_date) INTO _new_next_due
    FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');
  END IF;

  -- Update loan balances atomically
  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    next_due_date = _new_next_due,
    status = CASE
      WHEN (outstanding_principal - _principal_paid) <= 0
           AND (outstanding_interest - _interest_paid) <= 0
           AND (penalty_amount - _penalty_paid) <= 0
      THEN 'closed'::loan_status
      ELSE status
    END
  WHERE id = _loan_id;

  -- Sync clients.next_payment_date
  UPDATE public.clients
  SET next_payment_date = _new_next_due
  WHERE id = _loan.client_id;

  -- Insert into legacy transactions table (keep existing behavior)
  IF _penalty_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_penalty', _penalty_paid, CURRENT_DATE, 'paid', _performed_by, _reference_id, 'Penalty payment');
  END IF;

  IF _interest_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_interest', _interest_paid, CURRENT_DATE, 'paid', _performed_by,
      CASE WHEN _reference_id IS NOT NULL THEN _reference_id || '_interest' ELSE NULL END, 'Interest payment');
  END IF;

  IF _principal_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_principal', _principal_paid, CURRENT_DATE, 'paid', _performed_by,
      CASE WHEN _reference_id IS NOT NULL THEN _reference_id || '_principal' ELSE NULL END, 'Principal payment');
  END IF;

  -- ★ NEW: Insert into financial_transactions for analytics
  INSERT INTO public.financial_transactions (
    member_id, transaction_type, amount, approval_status, created_by, reference_id, notes,
    allocation_breakdown, receipt_number
  ) VALUES (
    _loan.client_id,
    'loan_repayment'::fin_transaction_type,
    _amount,
    'approved'::approval_status,
    COALESCE(_performed_by, auth.uid()),
    _reference_id,
    'Loan payment (waterfall: P=' || _penalty_paid || ' I=' || _interest_paid || ' Pr=' || _principal_paid || ')',
    jsonb_build_object(
      'penalty_paid', _penalty_paid,
      'interest_paid', _interest_paid,
      'principal_paid', _principal_paid,
      'loan_id', _loan_id
    ),
    'RCP-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)
  ) RETURNING id INTO _ft_id;

  -- ★ NEW: Update loan_schedules (waterfall across installments)
  _alloc_remaining := _principal_paid + _interest_paid;
  FOR _sched IN
    SELECT id, principal_due, interest_due, principal_paid AS pp, interest_paid AS ip
    FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'overdue', 'partial')
    ORDER BY due_date ASC
  LOOP
    EXIT WHEN _alloc_remaining <= 0;

    _sched_int_alloc := LEAST(GREATEST(_alloc_remaining, 0), GREATEST(_sched.interest_due - _sched.ip, 0));
    _alloc_remaining := _alloc_remaining - _sched_int_alloc;

    _sched_pri_alloc := LEAST(GREATEST(_alloc_remaining, 0), GREATEST(_sched.principal_due - _sched.pp, 0));
    _alloc_remaining := _alloc_remaining - _sched_pri_alloc;

    UPDATE public.loan_schedules SET
      interest_paid = interest_paid + _sched_int_alloc,
      principal_paid = principal_paid + _sched_pri_alloc,
      paid_date = CASE
        WHEN (interest_paid + _sched_int_alloc) >= interest_due
             AND (principal_paid + _sched_pri_alloc) >= principal_due
        THEN CURRENT_DATE ELSE paid_date END,
      status = CASE
        WHEN (interest_paid + _sched_int_alloc) >= interest_due
             AND (principal_paid + _sched_pri_alloc) >= principal_due
        THEN 'paid'
        WHEN (_sched_int_alloc + _sched_pri_alloc) > 0
        THEN 'partial'
        ELSE status END
    WHERE id = _sched.id;
  END LOOP;

  -- Recalculate next_due_date after schedule updates
  SELECT MIN(due_date) INTO _new_next_due
  FROM public.loan_schedules
  WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');

  UPDATE public.loans SET next_due_date = _new_next_due WHERE id = _loan_id;
  UPDATE public.clients SET next_payment_date = _new_next_due WHERE id = _loan.client_id;

  _result := jsonb_build_object(
    'loan_id', _loan_id,
    'total_payment', _amount,
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'new_outstanding', (_total_outstanding - _amount),
    'loan_closed', (_total_outstanding - _amount) <= 0,
    'next_due_date', _new_next_due,
    'receipt_id', _ft_id
  );

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details, user_id)
  VALUES ('loan_payment', 'loan', _loan_id, _result, _performed_by);

  IF (_total_outstanding - _amount) <= 0 THEN
    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details, user_id)
    VALUES ('loan_closed', 'loan', _loan_id, jsonb_build_object('closed_at', now(), 'final_payment', _amount), _performed_by);
  END IF;

  RETURN _result;
END;
$function$;
