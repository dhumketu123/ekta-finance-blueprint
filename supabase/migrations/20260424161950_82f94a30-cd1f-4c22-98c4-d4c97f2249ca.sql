-- =========================================================
-- GAP-FREE CONTRACT IMMUTABILITY LAYER
-- =========================================================

-- 1) FREEZE CONTRACT AGAINST UPDATE/DELETE
REVOKE UPDATE, DELETE ON public.financial_event_contract FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.financial_event_contract FROM authenticated;
GRANT INSERT ON public.financial_event_contract TO service_role;

-- 2) FROZEN CONTRACT READER (fail-fast)
CREATE OR REPLACE FUNCTION public.get_frozen_contract(p_event TEXT)
RETURNS TABLE(debit TEXT, credit TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT debit_account_code, credit_account_code
  FROM public.financial_event_contract
  WHERE event_type = p_event
    AND is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_frozen_contract(TEXT) TO authenticated, service_role;

-- 3) SYSTEM-WIDE PRE-CHECK HOOK (DEPLOY GUARD)
CREATE OR REPLACE FUNCTION public.assert_system_deploy_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v
  FROM public.financial_event_contract c
  WHERE c.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.debit_account_code)
      OR
      NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.credit_account_code)
    );

  IF v > 0 THEN
    RAISE EXCEPTION 'DEPLOY BLOCKED: contract gap detected (%)', v;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_system_deploy_safe() TO authenticated, service_role;

-- FORCE RUN (CI/CD style gate)
SELECT public.assert_system_deploy_safe();