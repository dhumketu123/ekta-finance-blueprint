-- FAIL-FAST CONTRACT VALIDATION
CREATE OR REPLACE FUNCTION public.validate_financial_system_integrity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing INT;
  v_self_post INT;
BEGIN
  -- missing COA mapping check
  SELECT COUNT(*) INTO v_missing
  FROM public.financial_event_contract c
  WHERE c.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.debit_account_code)
      OR
      NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.credit_account_code)
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'CONTRACT BROKEN: % missing account mappings', v_missing;
  END IF;

  -- self-posting prevention
  SELECT COUNT(*) INTO v_self_post
  FROM public.financial_event_contract
  WHERE is_active = true
    AND debit_account_code = credit_account_code;

  IF v_self_post > 0 THEN
    RAISE EXCEPTION 'CONTRACT BROKEN: self-posting detected (%)', v_self_post;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_financial_system_integrity() TO authenticated, service_role;

-- Run immediately (fail-fast)
SELECT public.validate_financial_system_integrity();