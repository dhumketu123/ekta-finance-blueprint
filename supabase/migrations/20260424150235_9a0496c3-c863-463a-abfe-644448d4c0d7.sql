CREATE OR REPLACE FUNCTION public.resolve_event_accounts(
  p_tenant_id UUID,
  p_event_type TEXT
)
RETURNS TABLE(debit_account_id UUID, credit_account_id UUID, ledger_required BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dr_code TEXT;
  v_cr_code TEXT;
  v_required BOOLEAN;
BEGIN
  SELECT debit_account_code, credit_account_code, ledger_required
    INTO v_dr_code, v_cr_code, v_required
  FROM public.financial_event_contract
  WHERE event_type = p_event_type;

  IF v_dr_code IS NULL THEN
    RAISE EXCEPTION 'Unknown financial event_type: %', p_event_type;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_dr_code),
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_cr_code),
    v_required;
END $$;