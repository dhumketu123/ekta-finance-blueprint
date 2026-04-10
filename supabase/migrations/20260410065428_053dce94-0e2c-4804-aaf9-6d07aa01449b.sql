
-- Secure ledger summary wrapper
CREATE OR REPLACE FUNCTION public.fn_get_secure_ledger_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_queued', (SELECT count(*) FROM public.ledger_guard_queue),
    'stuck_processing', (SELECT count(*) FROM public.ledger_guard_queue WHERE processing = true),
    'permanently_failed', (SELECT count(*) FROM public.ledger_guard_queue WHERE stuck_reason = 'FAILED_PERMANENT'),
    'recovered_total', (SELECT count(*) FROM public.ledger_guard_queue WHERE recovery_flag = true),
    'checked_at', now()
  );
$$;

-- Materialized view lockdown
DO $$
DECLARE
  v_mv text;
BEGIN
  FOR v_mv IN
    SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_mv);
  END LOOP;
END;
$$;
