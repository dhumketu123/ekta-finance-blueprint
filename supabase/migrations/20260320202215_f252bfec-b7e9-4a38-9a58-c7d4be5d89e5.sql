
DROP FUNCTION IF EXISTS public.disburse_loan(uuid, uuid, numeric, date, uuid, text, text);

CREATE OR REPLACE FUNCTION public.disburse_loan(
  _client_id         uuid,
  _loan_product_id   uuid,
  _principal_amount  numeric,
  _disbursement_date date,
  _assigned_officer  uuid DEFAULT NULL,
  _notes             text DEFAULT NULL,
  _loan_model        text DEFAULT 'flat'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  _result         jsonb;
BEGIN
  -- STEP 1: AUTHENTICATION GUARD
  IF _user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  -- STEP 2: RESOLVE AND VALIDATE TENANT ISOLATION
  SELECT * INTO _client
  FROM public.clients
  WHERE id = _client_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  _tenant := _client.tenant_id;

  SELECT tenant_id INTO _user_tenant
  FROM public.profiles
  WHERE id = _user;

  IF _user_tenant IS DISTINCT FROM _tenant THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'Access denied: tenant mismatch';
    END IF;
  END IF;

  -- STEP 3: VALIDATE LOAN PRODUCT
  SELECT * INTO _product
  FROM public.loan_products
  WHERE id = _loan_product_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan product not found';
  END IF;

  -- STEP 4: AMOUNT BOUNDARY CHECKS
  IF _principal_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF _principal_amount < _product.min_amount THEN
    RAISE EXCEPTION 'Amount below minimum limit';
  END IF;

  IF _principal_amount > _product.max_amount THEN
    RAISE EXCEPTION 'Amount exceeds maximum limit';
  END IF;

  -- STEP 5: CONCURRENT LOAN LIMIT CHECK
  SELECT COUNT(*) INTO _active_count
  FROM public.loans
  WHERE client_id = _client_id
    AND status = 'active'
    AND deleted_at IS NULL;

  IF _active_count >= _product.max_concurrent THEN
    RAISE EXCEPTION 'Max active loans reached';
  END IF;

  -- STEP 6: FINANCIAL CALCULATIONS
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

  -- STEP 7: MATURITY DATE
  IF _product.payment_type = 'weekly' THEN
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' weeks')::interval)::date;
  ELSE
    _maturity_date := (_disbursement_date + (_product.tenure_months || ' months')::interval)::date;
  END IF;

  -- STEP 8: CREATE LOAN RECORD
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
  )
  RETURNING * INTO _loan_row;

  _loan_id  := _loan_row.id;
  _loan_ref := COALESCE(_loan_row.loan_id, _loan_id::text);

  -- STEP 9: DISBURSEMENT TRANSACTION
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

  -- STEP 10: GENERATE SCHEDULE
  PERFORM public.generate_loan_schedule(
    _loan_id, _client_id,
    _principal_amount, _product.interest_rate,
    _product.tenure_months, _product.payment_type::text,
    _loan_model, _disbursement_date
  );

  -- STEP 11: UPDATE CLIENT
  UPDATE public.clients
  SET status = 'active',
      loan_amount = _principal_amount,
      loan_product_id = _loan_product_id,
      next_payment_date = (
        SELECT MIN(due_date)
        FROM public.loan_schedules
        WHERE loan_id = _loan_id AND status = 'pending'
      ),
      updated_at = now()
  WHERE id = _client_id;

  -- STEP 12: AUDIT LOG
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
      'tenant_id', _tenant
    )
  );

  -- STEP 13: BUILD RESPONSE
  _result := jsonb_build_object(
    'loan_id',           _loan_id,
    'loan_ref',          _loan_ref,
    'principal',         _principal_amount,
    'total_interest',    _total_interest,
    'total_owed',        _total_owed,
    'emi_amount',        _emi,
    'tenure',            _product.tenure_months,
    'payment_type',      _product.payment_type,
    'loan_model',        _loan_model,
    'disbursement_date', _disbursement_date,
    'maturity_date',     _maturity_date
  );

  RETURN _result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.disburse_loan(uuid, uuid, numeric, date, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disburse_loan(uuid, uuid, numeric, date, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.disburse_loan(uuid, uuid, numeric, date, uuid, text, text) TO authenticated;
