
-- =============================================
-- PHASE 3 STEP 0.5: FINANCIAL ENGINE HARDENING
-- =============================================

-- 1. Unique constraint for duplicate protection (reference_id + type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_type 
  ON public.transactions(reference_id, type) 
  WHERE reference_id IS NOT NULL AND deleted_at IS NULL;

-- 2. Enhanced apply_loan_payment with overpayment prevention, duplicate check, atomic logic
CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id UUID, 
  _amount NUMERIC, 
  _performed_by UUID DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
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
  _result JSONB;
BEGIN
  -- Duplicate reference check
  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.transactions WHERE reference_id = _reference_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Duplicate reference_id: %', _reference_id;
    END IF;
  END IF;

  -- Lock loan row
  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  -- Block payments on closed loans
  IF _loan.status = 'closed' THEN
    RAISE EXCEPTION 'Cannot accept payment on a closed loan';
  END IF;

  -- Prevent overpayment
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

  -- Update loan balances atomically
  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    status = CASE
      WHEN (outstanding_principal - _principal_paid) <= 0 
           AND (outstanding_interest - _interest_paid) <= 0 
           AND (penalty_amount - _penalty_paid) <= 0
      THEN 'closed'::loan_status
      ELSE status
    END
  WHERE id = _loan_id;

  -- Insert granular transactions
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

  _result := jsonb_build_object(
    'loan_id', _loan_id,
    'total_payment', _amount,
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'new_outstanding', (_total_outstanding - _amount),
    'loan_closed', (_total_outstanding - _amount) <= 0
  );

  -- Audit
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details, user_id)
  VALUES ('loan_payment', 'loan', _loan_id, _result, _performed_by);

  -- If loan closed, log closure event
  IF (_total_outstanding - _amount) <= 0 THEN
    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details, user_id)
    VALUES ('loan_closed', 'loan', _loan_id, jsonb_build_object('closed_at', now(), 'final_payment', _amount), _performed_by);
  END IF;

  RETURN _result;
END;
$$;

-- 3. Block transactions on closed loans (trigger)
CREATE OR REPLACE FUNCTION public.block_closed_loan_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.loan_id IS NOT NULL AND NEW.type IN ('loan_principal', 'loan_interest', 'loan_penalty', 'loan_repayment', 'loan_disbursement') THEN
    IF EXISTS (SELECT 1 FROM public.loans WHERE id = NEW.loan_id AND status = 'closed') THEN
      RAISE EXCEPTION 'Cannot insert transaction for closed loan %', NEW.loan_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closed_loan_tx ON public.transactions;
CREATE TRIGGER trg_block_closed_loan_tx
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.block_closed_loan_transactions();

-- 4. Overdue Detection & Penalty Function
CREATE OR REPLACE FUNCTION public.check_and_apply_overdue_penalty(_penalty_percent NUMERIC DEFAULT 2)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loan RECORD;
  _penalty NUMERIC;
  _count INTEGER := 0;
  _cycle TEXT;
  _results JSONB := '[]'::JSONB;
BEGIN
  _cycle := to_char(CURRENT_DATE, 'YYYY-MM');

  FOR _loan IN
    SELECT * FROM public.loans
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND maturity_date IS NOT NULL
      AND maturity_date < CURRENT_DATE
      AND outstanding_principal > 0
  LOOP
    -- Skip if penalty already applied this cycle
    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE loan_id = _loan.id
        AND type = 'loan_penalty'
        AND reference_id = 'overdue_' || _cycle || '_' || _loan.id
        AND deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    _penalty := ROUND(_loan.outstanding_principal * _penalty_percent / 100, 2);

    -- Add penalty to loan
    UPDATE public.loans SET penalty_amount = penalty_amount + _penalty WHERE id = _loan.id;

    -- Record transaction
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, reference_id, notes)
    VALUES (_loan.id, _loan.client_id, 'loan_penalty', _penalty, CURRENT_DATE, 'paid',
      'overdue_' || _cycle || '_' || _loan.id,
      'Auto overdue penalty ' || _penalty_percent || '% for cycle ' || _cycle);

    -- Audit
    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details)
    VALUES ('overdue_penalty', 'loan', _loan.id, jsonb_build_object(
      'penalty', _penalty, 'cycle', _cycle, 'outstanding_principal', _loan.outstanding_principal
    ));

    _results := _results || jsonb_build_object('loan_id', _loan.id, 'penalty', _penalty);
    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', _count, 'results', _results);
END;
$$;

-- 5. Financial Reporting View (all values derived from transactions)
CREATE OR REPLACE VIEW public.loan_financial_summary AS
SELECT
  l.id AS loan_id,
  l.client_id,
  l.total_principal,
  l.total_interest,
  l.loan_model,
  l.status,
  l.disbursement_date,
  l.maturity_date,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_principal'), 0) AS total_principal_collected,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_interest'), 0) AS total_interest_collected,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_penalty'), 0) AS total_penalty_collected,
  l.outstanding_principal + l.outstanding_interest + l.penalty_amount AS remaining_balance
FROM public.loans l
LEFT JOIN public.transactions t ON t.loan_id = l.id AND t.deleted_at IS NULL AND t.status = 'paid'
WHERE l.deleted_at IS NULL
GROUP BY l.id;
