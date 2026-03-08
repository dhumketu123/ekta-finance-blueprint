
CREATE OR REPLACE FUNCTION public.create_investor_secure(
  p_name_en TEXT,
  p_name_bn TEXT DEFAULT '',
  p_phone TEXT DEFAULT NULL,
  p_nid_number VARCHAR DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_source_of_fund TEXT DEFAULT NULL,
  p_capital NUMERIC DEFAULT 0,
  p_weekly_share NUMERIC DEFAULT 100,
  p_monthly_profit_percent NUMERIC DEFAULT 0,
  p_tenure_years INTEGER DEFAULT 1,
  p_investment_model investment_model DEFAULT 'profit_only',
  p_reinvest BOOLEAN DEFAULT false,
  p_principal_amount NUMERIC DEFAULT 0,
  p_nominee_name TEXT DEFAULT NULL,
  p_nominee_relation TEXT DEFAULT NULL,
  p_nominee_phone VARCHAR DEFAULT NULL,
  p_nominee_nid VARCHAR DEFAULT NULL,
  p_weekly_paid_until DATE DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_investor_id uuid;
BEGIN
  -- Resolve tenant_id from the authenticated user's profile
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve tenant_id for current user';
  END IF;

  INSERT INTO public.investors (
    name_en, name_bn, phone, nid_number, address, source_of_fund,
    capital, weekly_share, monthly_profit_percent, tenure_years,
    investment_model, reinvest, principal_amount,
    nominee_name, nominee_relation, nominee_phone, nominee_nid,
    weekly_paid_until, total_weekly_paid, tenant_id
  ) VALUES (
    p_name_en, p_name_bn, p_phone, p_nid_number, p_address, p_source_of_fund,
    p_capital, p_weekly_share, p_monthly_profit_percent, p_tenure_years,
    p_investment_model, p_reinvest, p_principal_amount,
    p_nominee_name, p_nominee_relation, p_nominee_phone, p_nominee_nid,
    p_weekly_paid_until, 0, v_tenant_id
  )
  RETURNING id INTO v_investor_id;

  RETURN v_investor_id;
END;
$$;
