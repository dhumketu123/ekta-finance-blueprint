
-- ══════════════════════════════════════════════════════════════
-- PHASE 1: Add next_due_date to loans table
-- PHASE 2: Add installment_day + installment_anchor_date to loans
-- ══════════════════════════════════════════════════════════════

-- Phase 1: next_due_date on loans (move responsibility from clients)
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS next_due_date date;

-- Phase 2: Fixed installment day rule
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS installment_day integer;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS installment_anchor_date date;

-- Populate next_due_date from existing schedules
UPDATE public.loans l
SET next_due_date = (
  SELECT MIN(due_date) FROM public.loan_schedules ls
  WHERE ls.loan_id = l.id AND ls.status IN ('pending', 'partial', 'overdue')
)
WHERE l.status = 'active' AND l.deleted_at IS NULL;

-- Populate installment_day from disbursement_date for existing loans
UPDATE public.loans
SET installment_day = EXTRACT(DAY FROM disbursement_date)::integer,
    installment_anchor_date = disbursement_date
WHERE disbursement_date IS NOT NULL AND installment_day IS NULL;

-- ══════════════════════════════════════════════════════════════
-- PHASE 1: Update apply_loan_payment to auto-set next_due_date
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_loan_payment(
  _loan_id uuid, _amount numeric, _performed_by uuid DEFAULT NULL, _reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

  -- ★ Calculate next_due_date AFTER payment will be applied
  -- (We calculate before update, using projected remaining)
  IF (_total_outstanding - _amount) <= 0 THEN
    _new_next_due := NULL; -- loan closed
  ELSE
    -- Will be set after mark_schedule_payment runs in the caller
    -- For now, get next pending/partial schedule
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

  -- ★ Also sync clients.next_payment_date
  UPDATE public.clients
  SET next_payment_date = _new_next_due
  WHERE id = _loan.client_id;

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
    'loan_closed', (_total_outstanding - _amount) <= 0,
    'next_due_date', _new_next_due
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

-- ══════════════════════════════════════════════════════════════
-- Also update the 3-param overload to call the 4-param version
-- ══════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.apply_loan_payment(uuid, numeric, uuid);

-- ══════════════════════════════════════════════════════════════
-- PHASE 1 continued: Fix next_due_date after mark_schedule_payment
-- Re-sync next_due_date after schedule is marked
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_schedule_payment(_loan_id uuid, _amount numeric, _paid_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _row        RECORD;
  _remaining  numeric := _amount;
  _total_row  numeric;
  _paid       numeric;
  _new_next   date;
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

  -- ★ Auto-update next_due_date on loan after schedule marking
  SELECT MIN(due_date) INTO _new_next
  FROM public.loan_schedules
  WHERE loan_id = _loan_id AND status IN ('pending', 'partial', 'overdue');

  UPDATE public.loans SET next_due_date = _new_next WHERE id = _loan_id;
  
  -- Also keep clients.next_payment_date in sync
  UPDATE public.clients c
  SET next_payment_date = _new_next
  FROM public.loans l
  WHERE l.id = _loan_id AND c.id = l.client_id;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 2: Update generate_loan_schedule to use installment_day
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_loan_schedule(
  _loan_id uuid, _client_id uuid, _principal numeric, _interest_rate numeric,
  _tenure integer, _payment_type text, _loan_model text, _disbursement_date date
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _i              integer;
  _due_date       date;
  _principal_due  numeric;
  _interest_due   numeric;
  _emi            numeric;
  _remaining      numeric;
  _monthly_rate   numeric;
  _interval       text;
  _inst_day       integer;
BEGIN
  -- ★ Capture installment_day from disbursement date
  _inst_day := EXTRACT(DAY FROM _disbursement_date)::integer;
  -- Clamp to 28 to avoid month-end issues
  IF _inst_day > 28 THEN _inst_day := 28; END IF;

  -- ★ Store installment_day and anchor on the loan
  UPDATE public.loans
  SET installment_day = _inst_day,
      installment_anchor_date = _disbursement_date
  WHERE id = _loan_id;

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
      -- ★ Fixed day rule: use make_date for consistent day
      IF _payment_type != 'weekly' THEN
        _due_date := make_date(
          EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          LEAST(_inst_day, 28)
        );
      ELSE
        _due_date := (_disbursement_date + (_i || ' weeks')::interval)::date;
      END IF;
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
        -- ★ Fixed day rule
        _due_date := make_date(
          EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          LEAST(_inst_day, 28)
        );
      END IF;
      IF _i = _tenure THEN
        _principal_due := _principal - ((_emi - _interest_due) * (_tenure - 1));
        _interest_due := ROUND(_principal * _interest_rate / 100 / _tenure, 2);
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
    _emi := ROUND(
      _principal * _monthly_rate * POWER(1 + _monthly_rate, _tenure) /
      (POWER(1 + _monthly_rate, _tenure) - 1), 2);
    _remaining := _principal;
    FOR _i IN 1.._tenure LOOP
      -- ★ Fixed day rule
      _due_date := make_date(
        EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
        EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
        LEAST(_inst_day, 28)
      );
      _interest_due := ROUND(_remaining * _monthly_rate, 2);
      _principal_due := ROUND(_emi - _interest_due, 2);
      IF _i = _tenure THEN
        _principal_due := _remaining;
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
$function$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 2: Update disburse_loan to set next_due_date on loan
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.disburse_loan(
  _client_id uuid, _loan_product_id uuid, _principal_amount numeric,
  _disbursement_date date DEFAULT CURRENT_DATE, _assigned_officer uuid DEFAULT NULL,
  _notes text DEFAULT NULL, _loan_model text DEFAULT 'flat'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  _first_due      date;
  _result         jsonb;
BEGIN
  -- 1. Validate loan product
  SELECT * INTO _product FROM public.loan_products
  WHERE id = _loan_product_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ঋণ পণ্য পাওয়া যায়নি (Loan product not found)';
  END IF;

  -- 2. Validate client
  SELECT * INTO _client FROM public.clients
  WHERE id = _client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'গ্রাহক পাওয়া যায়নি (Client not found)';
  END IF;

  -- 3. Amount range check
  IF _principal_amount < _product.min_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বনিম্ন সীমার নিচে: ৳% < ৳%', _principal_amount, _product.min_amount;
  END IF;
  IF _principal_amount > _product.max_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বোচ্চ সীমার উপরে: ৳% > ৳%', _principal_amount, _product.max_amount;
  END IF;

  -- 4. Check no active loan already exists
  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE client_id = _client_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'এই গ্রাহকের ইতিমধ্যে একটি সক্রিয় ঋণ আছে (Client already has an active loan)';
  END IF;

  -- 5. Calculate financials
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
    _total_interest := ROUND(_principal_amount * _product.interest_rate / 100, 2);
    _emi := ROUND((_principal_amount + _total_interest) / _product.tenure_months, 2);
  END IF;

  _total_owed := _principal_amount + _total_interest;

  IF _product.payment_type = 'weekly' THEN
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' weeks')::interval)::date;
  ELSE
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' months')::interval)::date;
  END IF;

  -- 6. Create loan record
  INSERT INTO public.loans (
    client_id, loan_product_id, assigned_officer,
    total_principal, total_interest,
    outstanding_principal, outstanding_interest,
    penalty_amount, emi_amount,
    loan_model, disbursement_date, maturity_date,
    status, notes,
    installment_day, installment_anchor_date
  ) VALUES (
    _client_id, _loan_product_id, _assigned_officer,
    _principal_amount, _total_interest,
    _principal_amount, _total_interest,
    0, _emi,
    _loan_model::loan_model, _disbursement_date, _maturity_date,
    'active', _notes,
    LEAST(EXTRACT(DAY FROM _disbursement_date)::integer, 28),
    _disbursement_date
  )
  RETURNING * INTO _loan_row;
  _loan_id := _loan_row.id;
  _loan_ref := COALESCE(_loan_row.loan_id, _loan_id::text);

  -- 7. Record disbursement transaction
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

  -- 8. Generate installment schedule
  PERFORM public.generate_loan_schedule(
    _loan_id, _client_id,
    _principal_amount, _product.interest_rate,
    _product.tenure_months, _product.payment_type::text,
    _loan_model, _disbursement_date
  );

  -- ★ Get first due date and set on loan + client
  SELECT MIN(due_date) INTO _first_due
  FROM public.loan_schedules WHERE loan_id = _loan_id;

  UPDATE public.loans SET next_due_date = _first_due WHERE id = _loan_id;

  -- 9. Update client status
  UPDATE public.clients
  SET status = 'active',
      loan_amount = _principal_amount,
      loan_product_id = _loan_product_id,
      next_payment_date = _first_due,
      updated_at = now()
  WHERE id = _client_id;

  -- 10. Audit log
  _result := jsonb_build_object(
    'loan_id', _loan_id,
    'loan_ref', _loan_ref,
    'client_id', _client_id,
    'principal', _principal_amount,
    'total_interest', _total_interest,
    'total_owed', _total_owed,
    'emi_amount', _emi,
    'tenure', _product.tenure_months,
    'payment_type', _product.payment_type,
    'loan_model', _loan_model,
    'disbursement_date', _disbursement_date,
    'maturity_date', _maturity_date,
    'next_due_date', _first_due,
    'installment_day', LEAST(EXTRACT(DAY FROM _disbursement_date)::integer, 28)
  );

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('loan_disbursement', 'loan', _loan_id, _assigned_officer, _result);

  RETURN _result;
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 3: Auto-default function for daily cron
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_default_loans()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _count integer := 0;
  _closed_count integer := 0;
BEGIN
  -- Mark loans as default if any schedule > 90 days overdue
  UPDATE public.loans l
  SET status = 'default'::loan_status, updated_at = now()
  WHERE l.status = 'active'
    AND l.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.loan_schedules ls
      WHERE ls.loan_id = l.id
        AND ls.status IN ('overdue', 'partial')
        AND ls.due_date < CURRENT_DATE - INTERVAL '90 days'
    );
  GET DIAGNOSTICS _count = ROW_COUNT;

  -- Auto-close loans with zero outstanding
  UPDATE public.loans
  SET status = 'closed'::loan_status, updated_at = now()
  WHERE status = 'active'
    AND deleted_at IS NULL
    AND outstanding_principal <= 0
    AND outstanding_interest <= 0
    AND penalty_amount <= 0;
  GET DIAGNOSTICS _closed_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'defaulted', _count,
    'auto_closed', _closed_count,
    'run_at', now()
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════
-- PHASE 4: Savings reconciliation function
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_savings_balances()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _row RECORD;
  _ledger_balance numeric;
  _mismatches jsonb := '[]'::jsonb;
  _mismatch_count integer := 0;
BEGIN
  FOR _row IN
    SELECT sa.id, sa.client_id, sa.balance as stored_balance
    FROM public.savings_accounts sa
    WHERE sa.status = 'active' AND sa.deleted_at IS NULL
  LOOP
    -- Calculate balance from transactions
    SELECT COALESCE(
      SUM(CASE WHEN t.type = 'savings_deposit' THEN t.amount ELSE 0 END) -
      SUM(CASE WHEN t.type = 'savings_withdrawal' THEN t.amount ELSE 0 END),
      0
    ) INTO _ledger_balance
    FROM public.transactions t
    WHERE t.savings_id = _row.id
      AND t.status = 'paid'
      AND t.deleted_at IS NULL;

    IF ABS(_row.stored_balance - _ledger_balance) > 0.01 THEN
      _mismatches := _mismatches || jsonb_build_array(jsonb_build_object(
        'savings_id', _row.id,
        'client_id', _row.client_id,
        'stored_balance', _row.stored_balance,
        'calculated_balance', _ledger_balance,
        'difference', _row.stored_balance - _ledger_balance
      ));
      _mismatch_count := _mismatch_count + 1;
    END IF;
  END LOOP;

  -- Log if mismatches found
  IF _mismatch_count > 0 THEN
    INSERT INTO public.audit_logs (action_type, entity_type, details)
    VALUES ('savings_reconciliation_alert', 'system',
      jsonb_build_object('mismatch_count', _mismatch_count, 'mismatches', _mismatches, 'run_at', now())
    );
  END IF;

  RETURN jsonb_build_object(
    'total_checked', (SELECT COUNT(*) FROM public.savings_accounts WHERE status = 'active' AND deleted_at IS NULL),
    'mismatches', _mismatch_count,
    'details', _mismatches,
    'run_at', now()
  );
END;
$function$;
