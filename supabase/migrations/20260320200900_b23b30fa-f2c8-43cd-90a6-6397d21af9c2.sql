
DROP FUNCTION IF EXISTS public.disburse_loan(uuid,uuid,numeric,date,uuid,text,text);

CREATE OR REPLACE FUNCTION public.disburse_loan(
  _client_id uuid,
  _loan_product_id uuid,
  _principal_amount numeric,
  _disbursement_date date,
  _assigned_officer uuid DEFAULT NULL,
  _notes text DEFAULT NULL,
  _loan_model text DEFAULT 'flat'
)
RETURNS jsonb
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
  _tenant         uuid;
BEGIN
  SELECT * INTO _product FROM public.loan_products
  WHERE id = _loan_product_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ঋণ পণ্য পাওয়া যায়নি (Loan product not found)';
  END IF;

  SELECT * INTO _client FROM public.clients
  WHERE id = _client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'গ্রাহক পাওয়া যায়নি (Client not found)';
  END IF;
  _tenant := _client.tenant_id;

  IF _principal_amount < _product.min_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বনিম্ন সীমার নিচে: ৳% < ৳%', _principal_amount, _product.min_amount;
  END IF;
  IF _principal_amount > _product.max_amount THEN
    RAISE EXCEPTION 'ঋণের পরিমাণ সর্বোচ্চ সীমার উপরে: ৳% > ৳%', _principal_amount, _product.max_amount;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loans
    WHERE client_id = _client_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'এই গ্রাহকের ইতিমধ্যে একটি সক্রিয় ঋণ আছে (Client already has an active loan)';
  END IF;

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
    _client_id, _loan_product_id, _assigned_officer,
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
  _loan_id := _loan_row.id;
  _loan_ref := COALESCE(_loan_row.loan_id, _loan_id::text);

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

  PERFORM public.generate_loan_schedule(
    _loan_id, _client_id,
    _principal_amount, _product.interest_rate,
    _product.tenure_months, _product.payment_type::text,
    _loan_model, _disbursement_date
  );

  UPDATE public.clients
  SET status = 'active',
      loan_amount = _principal_amount,
      loan_product_id = _loan_product_id,
      next_payment_date = (
        SELECT MIN(due_date) FROM public.loan_schedules
        WHERE loan_id = _loan_id AND status = 'pending'
      ),
      updated_at = now()
  WHERE id = _client_id;

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
END;
$$;
