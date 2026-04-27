CREATE OR REPLACE FUNCTION public.generate_loan_schedule(
  _loan_id uuid, _client_id uuid, _principal numeric, _interest_rate numeric,
  _tenure integer, _payment_type text, _loan_model text, _disbursement_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  _inst_day := EXTRACT(DAY FROM _disbursement_date)::integer;
  IF _inst_day > 28 THEN _inst_day := 28; END IF;

  UPDATE public.loans
  SET installment_day = _inst_day,
      installment_anchor_date = _disbursement_date
  WHERE id = _loan_id;

  _interval := CASE _payment_type WHEN 'weekly' THEN '1 week' ELSE '1 month' END;

  -- BULLET
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

  -- MONTHLY PROFIT
  IF _payment_type = 'monthly_profit' THEN
    _monthly_rate := ROUND(_principal * _interest_rate / 100, 2);
    FOR _i IN 1.._tenure LOOP
      IF _payment_type != 'weekly' THEN
        _due_date := make_date(
          EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          LEAST(_inst_day, 28));
      ELSE
        _due_date := (_disbursement_date + (_i || ' weeks')::interval)::date;
      END IF;
      _principal_due := CASE WHEN _i = _tenure THEN _principal ELSE 0 END;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES (_loan_id, _client_id, _i, _due_date, _principal_due, _monthly_rate, 'pending');
    END LOOP;
    RETURN;
  END IF;

  -- FLAT EMI / monthly / weekly
  IF _loan_model = 'flat' OR _payment_type IN ('monthly', 'weekly') THEN
    _emi := ROUND((_principal + _principal * _interest_rate / 100) / _tenure, 2);
    _interest_due := ROUND(_principal * _interest_rate / 100 / _tenure, 2);
    _principal_due := _emi - _interest_due;
    FOR _i IN 1.._tenure LOOP
      IF _payment_type = 'weekly' THEN
        _due_date := (_disbursement_date + (_i || ' weeks')::interval)::date;
      ELSE
        _due_date := make_date(
          EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          LEAST(_inst_day, 28));
      END IF;
      IF _i = _tenure THEN
        _principal_due := _principal - ((_emi - _interest_due) * (_tenure - 1));
        _interest_due := ROUND(_principal * _interest_rate / 100 / _tenure, 2);
      END IF;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES (_loan_id, _client_id, _i, _due_date, _principal_due, _interest_due, 'pending');
    END LOOP;
    RETURN;
  END IF;

  -- REDUCING BALANCE EMI
  IF _loan_model = 'reducing' THEN
    -- ★ ZERO-INTEREST GUARD: avoid 0/0 in EMI formula → simple equal split
    IF _interest_rate IS NULL OR _interest_rate = 0 THEN
      _principal_due := ROUND(_principal / _tenure, 2);
      _remaining := _principal;
      FOR _i IN 1.._tenure LOOP
        _due_date := make_date(
          EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
          LEAST(_inst_day, 28));
        IF _i = _tenure THEN
          _principal_due := _remaining;
        END IF;
        INSERT INTO public.loan_schedules
          (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
        VALUES (_loan_id, _client_id, _i, _due_date, _principal_due, 0, 'pending');
        _remaining := _remaining - _principal_due;
      END LOOP;
      RETURN;
    END IF;

    _monthly_rate := _interest_rate / 100 / 12;
    _emi := ROUND(
      _principal * _monthly_rate * POWER(1 + _monthly_rate, _tenure) /
      (POWER(1 + _monthly_rate, _tenure) - 1), 2);
    _remaining := _principal;
    FOR _i IN 1.._tenure LOOP
      _due_date := make_date(
        EXTRACT(YEAR FROM (_disbursement_date + (_i || ' months')::interval))::integer,
        EXTRACT(MONTH FROM (_disbursement_date + (_i || ' months')::interval))::integer,
        LEAST(_inst_day, 28));
      _interest_due := ROUND(_remaining * _monthly_rate, 2);
      _principal_due := ROUND(_emi - _interest_due, 2);
      IF _i = _tenure THEN
        _principal_due := _remaining;
      END IF;
      INSERT INTO public.loan_schedules
        (loan_id, client_id, installment_number, due_date, principal_due, interest_due, status)
      VALUES (_loan_id, _client_id, _i, _due_date, _principal_due, _interest_due, 'pending');
      _remaining := _remaining - _principal_due;
    END LOOP;
    RETURN;
  END IF;
END $function$;