-- STEP 1: Rebind orphaned cron to new worker
DO $$
DECLARE jid INT;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'event-processor' LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'event-processor',
  '* * * * *',
  $$SELECT public.run_financial_event_worker();$$
);

-- STEP 2: Bind tenant isolation triggers
DROP TRIGGER IF EXISTS trg_assert_tenant_gateway ON public.financial_event_gateway;
CREATE TRIGGER trg_assert_tenant_gateway
  BEFORE INSERT OR UPDATE ON public.financial_event_gateway
  FOR EACH ROW EXECUTE FUNCTION public.assert_tenant_isolation();

DROP TRIGGER IF EXISTS trg_assert_tenant_ledger ON public.double_entry_ledger;
CREATE TRIGGER trg_assert_tenant_ledger
  BEFORE INSERT OR UPDATE ON public.double_entry_ledger
  FOR EACH ROW EXECUTE FUNCTION public.assert_tenant_isolation();