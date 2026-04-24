CREATE OR REPLACE FUNCTION public.touch_financial_event_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.validate_event_contract()
RETURNS TABLE(tenant_id UUID, missing_code TEXT, event_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH needed AS (
    SELECT t.id AS tenant_id, c.code
    FROM public.tenants t
    CROSS JOIN (
      SELECT debit_account_code  AS code FROM public.financial_event_contract
      UNION
      SELECT credit_account_code AS code FROM public.financial_event_contract
    ) c
  )
  SELECT n.tenant_id, n.code, fec.event_type
  FROM needed n
  LEFT JOIN public.chart_of_accounts coa
    ON coa.tenant_id = n.tenant_id AND coa.code = n.code
  LEFT JOIN public.financial_event_contract fec
    ON fec.debit_account_code = n.code OR fec.credit_account_code = n.code
  WHERE coa.id IS NULL;
END $$;