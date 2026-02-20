
-- ============================================================
-- LOAN SCHEDULES TABLE
-- per-installment tracking: due_date, principal, interest, status
-- ============================================================
CREATE TABLE IF NOT EXISTS public.loan_schedules (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id             uuid        NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  client_id           uuid        NOT NULL REFERENCES public.clients(id),
  installment_number  integer     NOT NULL,
  due_date            date        NOT NULL,
  principal_due       numeric     NOT NULL DEFAULT 0,
  interest_due        numeric     NOT NULL DEFAULT 0,
  total_due           numeric     GENERATED ALWAYS AS (principal_due + interest_due) STORED,
  principal_paid      numeric     NOT NULL DEFAULT 0,
  interest_paid       numeric     NOT NULL DEFAULT 0,
  penalty_due         numeric     NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','partial','overdue')),
  paid_date           date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_id    ON public.loan_schedules(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_due_date   ON public.loan_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_status     ON public.loan_schedules(status);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_client_id  ON public.loan_schedules(client_id);

-- updated_at trigger
CREATE TRIGGER trg_loan_schedules_updated_at
  BEFORE UPDATE ON public.loan_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.loan_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access loan_schedules"
  ON public.loan_schedules FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Field officers view assigned loan schedules"
  ON public.loan_schedules FOR SELECT
  USING (public.is_field_officer() AND public.is_assigned_to_client(client_id));

CREATE POLICY "Treasurer view loan_schedules"
  ON public.loan_schedules FOR SELECT
  USING (public.is_treasurer());


-- ============================================================
-- REALTIME: enable loan_schedules
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.loan_schedules;


-- ============================================================
-- HELPER: generate_loan_schedule()
-- Generates installment rows for a given loan
-- Supports: emi (flat/reducing), monthly_profit, bullet, weekly, monthly
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_loan_schedule(
  _loan_id          uuid,
  _client_id        uuid,
  _principal        numeric,
  _interest_rate    numeric,   -- annual % for flat, monthly % for profit-only
  _tenure           integer,   -- number of installments
  _payment_type     text,      -- emi | monthly | weekly | monthly_profit | bullet
  _loan_model       text,      -- flat | reducing
  _disbursement_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _i              integer;
  _due_date       date;
  _principal_due  numeric;
  _interest_due   numeric;
  _emi            numeric;
  _remaining      numeric;
  _monthly_rate   numeric;
  _interval       text;
BEGIN
  -- determine date interval
  _interval := CASE _payment_type
    WHEN 'weekly' THEN '1 week'
    ELSE '1 month'
  END;

  -- ── BULLET: single payment at end ─────────────────────────
  IF _payment_type = 'bullet' THEN
    _interest_due := ROUND(_principal * _interest_rate / 100 * _tenure / 12, 2);
    INSERT INTO public.loan_schedules
      (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
    VALUES
      (_loan_id, _client_id, 1,
       (_disbursement_date + (_tenure || ' months')::interval)::date,
       _principal, _interest_due, 'pending');
    RETURN;
  END IF;

  -- ── MONTHLY PROFIT: monthly interest, principal at end ────
  IF _payment_type = 'monthly_profit' THEN
    _monthly_rate := ROUND(_principal * _interest_rate / 100, 2);
    FOR _i IN 1.._tenure LOOP
      _due_date := (_disbursement_date + (_i || ' months')::interval)::date;
      _principal_due := CASE WHEN _i = _tenure THEN _principal ELSE 0 END;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES
        (_loan_id, _client_id, _i, _due_date, _principal_due, _monthly_rate, 'pending');
    END LOOP;
    RETURN;
  END IF;

  -- ── FLAT EMI / monthly / weekly ───────────────────────────
  IF _loan_model = 'flat' OR _payment_type IN ('monthly', 'weekly') THEN
    _emi := ROUND((_principal + _principal * _interest_rate / 100) / _tenure, 2);
    _interest_due := ROUND(_principal * _interest_rate / 100 / _tenure, 2);
    _principal_due := _emi - _interest_due;
    FOR _i IN 1.._tenure LOOP
      IF _payment_type = 'weekly' THEN
        _due_date := (_disbursement_date + (_i || ' weeks')::interval)::date;
      ELSE
        _due_date := (_disbursement_date + (_i || ' months')::interval)::date;
      END IF;
      -- last installment absorbs rounding remainder
      IF _i = _tenure THEN
        _principal_due := _principal - (_principal_due * (_tenure - 1));
        _interest_due  := ROUND(_principal * _interest_rate / 100 / _tenure, 2);
      END IF;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES
        (_loan_id, _client_id, _i, _due_date, _principal_due, _interest_due, 'pending');
    END LOOP;
    RETURN;
  END IF;

  -- ── REDUCING BALANCE EMI ──────────────────────────────────
  IF _loan_model = 'reducing' THEN
    _monthly_rate := _interest_rate / 100 / 12;
    -- annuity formula EMI
    _emi := ROUND(
      _principal * _monthly_rate * POWER(1 + _monthly_rate, _tenure) /
      (POWER(1 + _monthly_rate, _tenure) - 1), 2);
    _remaining := _principal;
    FOR _i IN 1.._tenure LOOP
      _due_date := (_disbursement_date + (_i || ' months')::interval)::date;
      _interest_due := ROUND(_remaining * _monthly_rate, 2);
      _principal_due := ROUND(_emi - _interest_due, 2);
      IF _i = _tenure THEN
        _principal_due := _remaining;  -- clear rounding residual
      END IF;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES
        (_loan_id, _client_id, _i, _due_date, _principal_due, _interest_due, 'pending');
      _remaining := _remaining - _principal_due;
    END LOOP;
    RETURN;
  END IF;
END;
$$;


-- ============================================================
-- CORE RPC: disburse_loan()
-- Atomically: validates → creates loan → records disbursement
--             → updates client → generates schedule
-- ============================================================
CREATE OR REPLACE FUNCTION public.disburse_loan(
  _client_id          uuid,
  _loan_product_id    uuid,
  _principal_amount   numeric,
  _disbursement_date  date      DEFAULT CURRENT_DATE,
  _assigned_officer   uuid      DEFAULT NULL,
  _notes              text      DEFAULT NULL,
  _loan_model         text      DEFAULT 'flat'   -- 'flat' | 'reducing'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product        RECORD;
  _client         RECORD;
  _loan_id        uuid;
  _loan_row       RECORD;
  _total_interest numeric;
  _total_owed     numeric;
  _emi            numeric;
  _maturity_date  date;
  _loan_ref       text;
  _result         jsonb;
BEGIN
  -- ── 1. Validate loan product ────────────────────────────
  SELECT * INTO _product FROM public.loan_products
  WHERE id = _loan_product_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ঋণ পণ্য পাওয়া যায়নি (Loan product not found)';
  END IF;

  -- ── 2. Validate client ──────────────────────────────────
  SELECT * INTO _client FROM public.clients
  WHERE id = _client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'গ্রাহক পাওয়া যায়নি (Client not found)';
  END IF;

  -- ── 3. Amount range check ───────────────────────────────
  IF _principal_amount < _product.min_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বনিম্ন সীমার নিচে: ৳% < ৳%', _principal_amount, _product.min_amount;
  END IF;
  IF _principal_amount > _product.max_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বোচ্চ সীমার উপরে: ৳% > ৳%', _principal_amount, _product.max_amount;
  END IF;

  -- ── 4. Check no active loan already exists ──────────────
  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE client_id = _client_id
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'এই গ্রাহকের ইতিমধ্যে একটি সক্রিয় ঋণ আছে (Client already has an active loan)';
  END IF;

  -- ── 5. Calculate financials ─────────────────────────────
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
      _emi := ROUND(_principal_amount * _r * POWER(1+_r, _n) / (POWER(1+_r, _n) - 1), 2);
      _total_interest := ROUND(_emi * _n - _principal_amount, 2);
    END;
  ELSE
    -- flat rate
    _total_interest := ROUND(_principal_amount * _product.interest_rate / 100, 2);
    _emi := ROUND((_principal_amount + _total_interest) / _product.tenure_months, 2);
  END IF;

  _total_owed := _principal_amount + _total_interest;

  -- maturity date based on payment_type
  IF _product.payment_type = 'weekly' THEN
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' weeks')::interval)::date;
  ELSE
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' months')::interval)::date;
  END IF;

  -- ── 6. Create loan record ───────────────────────────────
  INSERT INTO public.loans (
    client_id, loan_product_id, assigned_officer,
    total_principal, total_interest,
    outstanding_principal, outstanding_interest,
    penalty_amount, emi_amount,
    loan_model, disbursement_date, maturity_date,
    status, notes
  ) VALUES (
    _client_id, _loan_product_id, _assigned_officer,
    _principal_amount, _total_interest,
    _principal_amount, _total_interest,
    0, _emi,
    _loan_model::loan_model, _disbursement_date, _maturity_date,
    'active', _notes
  )
  RETURNING * INTO _loan_row;
  _loan_id := _loan_row.id;
  _loan_ref := COALESCE(_loan_row.loan_id, _loan_id::text);

  -- ── 7. Record disbursement transaction ──────────────────
  INSERT INTO public.transactions (
    loan_id, client_id, type, amount,
    transaction_date, status, performed_by,
    reference_id, notes
  ) VALUES (
    _loan_id, _client_id, 'loan_disbursement', _principal_amount,
    _disbursement_date, 'paid', _assigned_officer,
    'DISB-' || _loan_ref,
    'ঋণ বিতরণ — ' || COALESCE(_product.product_name_bn, _product.product_name_en)
  );

  -- ── 8. Update client status and loan_amount ──────────────
  UPDATE public.clients
  SET status       = 'active',
      loan_amount  = _principal_amount,
      loan_product_id = _loan_product_id,
      next_payment_date = (
        SELECT due_date FROM public.loan_schedules
        WHERE loan_id = _loan_id
        ORDER BY installment_number
        LIMIT 1
      ),
      updated_at   = now()
  WHERE id = _client_id;

  -- ── 9. Generate installment schedule ────────────────────
  PERFORM public.generate_loan_schedule(
    _loan_id, _client_id,
    _principal_amount, _product.interest_rate,
    _product.tenure_months, _product.payment_type::text,
    _loan_model, _disbursement_date
  );

  -- Update client next_payment_date after schedule generated
  UPDATE public.clients
  SET next_payment_date = (
    SELECT due_date FROM public.loan_schedules
    WHERE loan_id = _loan_id
    ORDER BY installment_number
    LIMIT 1
  )
  WHERE id = _client_id;

  -- ── 10. Audit log ────────────────────────────────────────
  _result := jsonb_build_object(
    'loan_id',          _loan_id,
    'loan_ref',         _loan_ref,
    'client_id',        _client_id,
    'principal',        _principal_amount,
    'total_interest',   _total_interest,
    'total_owed',       _total_owed,
    'emi_amount',       _emi,
    'tenure',           _product.tenure_months,
    'payment_type',     _product.payment_type,
    'loan_model',       _loan_model,
    'disbursement_date', _disbursement_date,
    'maturity_date',    _maturity_date
  );

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('loan_disbursement', 'loan', _loan_id, _assigned_officer, _result);

  RETURN _result;
END;
$$;


-- ============================================================
-- HELPER: mark_installment_paid()
-- Called after approve_pending_transaction to reconcile schedule
-- Updates the earliest unpaid installment(s) matching the payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_schedule_payment(
  _loan_id    uuid,
  _amount     numeric,
  _paid_date  date DEFAULT CURRENT_DATE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row        RECORD;
  _remaining  numeric := _amount;
  _total_row  numeric;
  _paid       numeric;
BEGIN
  FOR _row IN
    SELECT * FROM public.loan_schedules
    WHERE loan_id = _loan_id
      AND status IN ('pending','partial','overdue')
    ORDER BY installment_number
  LOOP
    EXIT WHEN _remaining <= 0;

    _total_row := (_row.principal_due + _row.interest_due + _row.penalty_due)
                  - (_row.principal_paid + _row.interest_paid);

    IF _total_row <= 0 THEN CONTINUE; END IF;

    _paid := LEAST(_remaining, _total_row);
    _remaining := _remaining - _paid;

    UPDATE public.loan_schedules
    SET
      principal_paid = LEAST(principal_paid + _paid, principal_due),
      interest_paid  = CASE
                         WHEN principal_paid + _paid >= principal_due
                         THEN LEAST(interest_paid + (_paid - (principal_due - principal_paid)), interest_due)
                         ELSE interest_paid
                       END,
      status = CASE
        WHEN (_total_row - _paid) <= 0 THEN 'paid'
        ELSE 'partial'
      END,
      paid_date = CASE WHEN (_total_row - _paid) <= 0 THEN _paid_date ELSE paid_date END,
      updated_at = now()
    WHERE id = _row.id;
  END LOOP;
END;
$$;


-- ============================================================
-- AUTO-MARK SCHEDULES when loan payment is approved
-- Extend approve_pending_transaction to call mark_schedule_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_pending_transaction(
  _tx_id      uuid,
  _reviewer_id uuid,
  _reason     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx     RECORD;
  _result JSONB;
BEGIN
  SELECT * INTO _tx FROM public.pending_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending transaction not found'; END IF;
  IF _tx.status != 'pending' THEN
    RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.status;
  END IF;

  -- Apply based on type
  IF _tx.type IN ('loan_principal','loan_interest','loan_penalty','loan_repayment') THEN
    IF _tx.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan payment'; END IF;
    _result := public.apply_loan_payment(_tx.loan_id, _tx.amount, _tx.submitted_by, _tx.reference_id);
    -- Reconcile installment schedule
    PERFORM public.mark_schedule_payment(_tx.loan_id, _tx.amount, CURRENT_DATE);

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


-- ============================================================
-- OVERDUE SYNC: mark schedule rows overdue when past due
-- Called by daily cron or manually
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_overdue_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  UPDATE public.loan_schedules
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending'
    AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN jsonb_build_object('overdue_marked', _count, 'run_at', now());
END;
$$;
