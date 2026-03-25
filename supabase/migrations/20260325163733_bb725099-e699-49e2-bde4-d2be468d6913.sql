-- ==============================================================================
-- 1. THE IRON GATE: UPFRONT SAVINGS VALIDATION TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_mfi_upfront_savings()
RETURNS trigger AS $$
DECLARE
  _upfront_pct numeric;
  _required_savings numeric;
  _actual_savings numeric;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    SELECT upfront_savings_pct INTO _upfront_pct
    FROM public.loan_products WHERE id = NEW.loan_product_id;

    IF COALESCE(_upfront_pct, 0) > 0 THEN
      _required_savings := (NEW.total_principal * _upfront_pct) / 100;

      SELECT COALESCE(SUM(balance), 0) INTO _actual_savings
      FROM public.savings_accounts
      WHERE client_id = NEW.client_id AND status = 'active';

      IF _actual_savings < _required_savings THEN
        RAISE EXCEPTION 'MFI Rule Violation: Client requires savings of % (% pct upfront), but currently has only %.', 
          _required_savings, _upfront_pct, _actual_savings;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_mfi_upfront_savings ON public.loans;
CREATE TRIGGER trg_check_mfi_upfront_savings
BEFORE INSERT OR UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.check_mfi_upfront_savings();

-- ==============================================================================
-- 2. UPGRADED apply_loan_payment WITH MFI DPS + ALL EXISTING GUARDS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id uuid,
  _amount numeric,
  _performed_by uuid,
  _reference_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  _new_next_due date;
  _sched record;
  _sched_int_alloc numeric;
  _sched_pri_alloc numeric;
  _alloc_remaining numeric;
  _ft_id uuid;
  _loan_should_close boolean;
  _receipt_num text;
  _result jsonb;
BEGIN
  -- GUARD: Duplicate reference_id
  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE reference_id = _reference_id) THEN
      RAISE EXCEPTION 'Duplicate reference_id: %', _reference_id;
    END IF;
  END IF;

  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;

  IF _loan IS NULL THEN
    RAISE EXCEPTION 'Loan not found: %', _loan_id;
  END IF;

  -- Auto-repair: reopen if closed but has balance
  IF _loan.status = 'closed' THEN
    IF (_loan.outstanding_principal + _loan.outstanding_interest + _loan.penalty_amount) > 0 THEN
      UPDATE public.loans SET status = 'active', updated_at = now() WHERE id = _loan_id;
      SELECT * INTO _loan FROM public.loans WHERE id = _loan_id FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'Cannot accept payment on a fully closed loan';
    END IF;
  END IF;

  _total_outstanding := _loan.penalty_amount + _loan.outstanding_interest + _loan.outstanding_principal;

  -- Get DPS amount
  SELECT compulsory_savings_amount INTO _dps_due
  FROM public.loan_products WHERE id = _loan.loan_product_id;
  _dps_due := COALESCE(_dps_due, 0);

  -- GUARD: Overpayment
  IF _amount > (_total_outstanding + _dps_due) THEN
    RAISE EXCEPTION 'Payment exceeds total outstanding plus DPS';
  END IF;

  _remaining := _amount;

  -- MFI LOGIC: Extract Compulsory DPS First
  IF _dps_due > 0 AND _remaining > 0 THEN
    _dps_paid := LEAST(_remaining, _dps_due);
    _remaining := _remaining - _dps_paid;

    SELECT id INTO _savings_account_id
    FROM public.savings_accounts
    WHERE client_id = _loan.client_id AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;

    IF _savings_account_id IS NOT NULL THEN
      UPDATE public.savings_accounts
      SET balance = balance + _dps_paid, updated_at = now()
      WHERE id = _savings_account_id;

      INSERT INTO public.financial_transactions
        (member_id, account_id, transaction_type, amount, created_by, approval_status, reference_id, notes)
      VALUES
        (_loan.client_id, _savings_account_id, 'savings_deposit', _dps_paid, _performed_by, 'approved',
         _reference_id || '_dps', 'Auto DPS collection from Loan EMI');
    END IF;
  END IF;

  -- If nothing left for loan after DPS
  IF _remaining <= 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'dps_collected', _dps_paid,
      'penalty_paid', 0, 'interest_paid', 0, 'principal_paid', 0,
      'new_outstanding', _total_outstanding, 'loan_closed', false
    );
  END IF;

  -- PHASE 1: Waterfall Allocation
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

  _loan_should_close := ((_loan.penalty_amount - _penalty_paid) + (_loan.outstanding_interest - _interest_paid) + (_loan.outstanding_principal - _principal_paid)) <= 0;

  IF _loan_should_close THEN
    _new_next_due := NULL;
  ELSE
    SELECT MIN(due_date) INTO _new_next_due
    FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');
  END IF;

  -- PHASE 2: Update Loan Balances
  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    next_due_date = _new_next_due,
    updated_at = now()
  WHERE id = _loan_id;

  -- PHASE 3: Distribute to Schedules
  _alloc_remaining := (_penalty_paid + _interest_paid + _principal_paid);
  FOR _sched IN
    SELECT * FROM public.loan_schedules
    WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue')
    ORDER BY installment_number ASC
  LOOP
    EXIT WHEN _alloc_remaining <= 0;

    _sched_int_alloc := LEAST(_alloc_remaining, GREATEST(_sched.interest_due - _sched.interest_paid, 0));
    _alloc_remaining := _alloc_remaining - _sched_int_alloc;

    _sched_pri_alloc := LEAST(_alloc_remaining, GREATEST(_sched.principal_due - _sched.principal_paid, 0));
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

  -- PHASE 4: Record Financial Transaction
  _receipt_num := 'RCP-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.financial_transactions
    (member_id, account_id, transaction_type, amount, created_by, approval_status, reference_id, notes, allocation_breakdown, receipt_number)
  VALUES
    (_loan.client_id, _loan_id, 'loan_repayment', (_penalty_paid + _interest_paid + _principal_paid),
     _performed_by, 'approved', _reference_id, 'কিস্তি পরিশোধ',
     jsonb_build_object('penalty', _penalty_paid, 'interest', _interest_paid, 'principal', _principal_paid, 'dps_auto_deducted', _dps_paid),
     _receipt_num)
  RETURNING id INTO _ft_id;

  -- PHASE 5: Close loan if fully paid
  IF _loan_should_close THEN
    UPDATE public.loans SET status = 'closed'::loan_status, updated_at = now() WHERE id = _loan_id;
  END IF;

  UPDATE public.clients SET next_payment_date = _new_next_due, updated_at = now() WHERE id = _loan.client_id;

  _result := jsonb_build_object(
    'success', true,
    'dps_collected', _dps_paid,
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'new_outstanding', (_total_outstanding - (_penalty_paid + _interest_paid + _principal_paid)),
    'loan_closed', _loan_should_close,
    'ft_id', _ft_id
  );
  RETURN _result;
END;
$$;