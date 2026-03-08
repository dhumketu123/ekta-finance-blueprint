
-- Secure UPDATE RPC for investors (tenant-verified)
CREATE OR REPLACE FUNCTION public.update_investor_secure(
  p_id UUID,
  p_name_en TEXT DEFAULT NULL,
  p_name_bn TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_nid_number VARCHAR DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_source_of_fund TEXT DEFAULT NULL,
  p_capital NUMERIC DEFAULT NULL,
  p_weekly_share NUMERIC DEFAULT NULL,
  p_monthly_profit_percent NUMERIC DEFAULT NULL,
  p_tenure_years INTEGER DEFAULT NULL,
  p_investment_model investment_model DEFAULT NULL,
  p_reinvest BOOLEAN DEFAULT NULL,
  p_principal_amount NUMERIC DEFAULT NULL,
  p_nominee_name TEXT DEFAULT NULL,
  p_nominee_relation TEXT DEFAULT NULL,
  p_nominee_phone VARCHAR DEFAULT NULL,
  p_nominee_nid VARCHAR DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_record_tenant uuid;
BEGIN
  -- Resolve caller's tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve tenant_id for current user';
  END IF;

  -- Verify record belongs to same tenant
  SELECT tenant_id INTO v_record_tenant
  FROM public.investors
  WHERE id = p_id;

  IF v_record_tenant IS NULL THEN
    RAISE EXCEPTION 'Investor record not found';
  END IF;

  IF v_record_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Unauthorized: tenant mismatch';
  END IF;

  UPDATE public.investors SET
    name_en = COALESCE(p_name_en, name_en),
    name_bn = COALESCE(p_name_bn, name_bn),
    phone = COALESCE(p_phone, phone),
    nid_number = COALESCE(p_nid_number, nid_number),
    address = COALESCE(p_address, address),
    source_of_fund = COALESCE(p_source_of_fund, source_of_fund),
    capital = COALESCE(p_capital, capital),
    weekly_share = COALESCE(p_weekly_share, weekly_share),
    monthly_profit_percent = COALESCE(p_monthly_profit_percent, monthly_profit_percent),
    tenure_years = COALESCE(p_tenure_years, tenure_years),
    investment_model = COALESCE(p_investment_model, investment_model),
    reinvest = COALESCE(p_reinvest, reinvest),
    principal_amount = COALESCE(p_principal_amount, principal_amount),
    nominee_name = COALESCE(p_nominee_name, nominee_name),
    nominee_relation = COALESCE(p_nominee_relation, nominee_relation),
    nominee_phone = COALESCE(p_nominee_phone, nominee_phone),
    nominee_nid = COALESCE(p_nominee_nid, nominee_nid),
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Secure soft-exit RPC for investors
CREATE OR REPLACE FUNCTION public.exit_investor_secure(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_record_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unable to resolve tenant_id for current user';
  END IF;

  SELECT tenant_id INTO v_record_tenant
  FROM public.investors
  WHERE id = p_id;

  IF v_record_tenant IS NULL THEN
    RAISE EXCEPTION 'Investor record not found';
  END IF;

  IF v_record_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Unauthorized: tenant mismatch';
  END IF;

  UPDATE public.investors SET
    status = 'inactive',
    updated_at = now()
  WHERE id = p_id;
END;
$$;
