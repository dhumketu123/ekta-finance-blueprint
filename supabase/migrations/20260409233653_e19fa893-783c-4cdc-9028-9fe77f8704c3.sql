
CREATE OR REPLACE FUNCTION public.fn_snapshot_system_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_health_score numeric;
  v_sms_pending int;
  v_sms_failed int;
  v_sms_total int;
  v_sms_sla numeric;
  v_mismatch_count int;
  v_cron_ok int;
  v_cron_stale int;
  v_events_pending int;
  v_events_dead int;
BEGIN
  BEGIN
    SELECT (result->>'health_score')::numeric INTO v_health_score
    FROM (SELECT public.fn_system_health_status() as result) sub;
  EXCEPTION WHEN OTHERS THEN
    v_health_score := -1;
  END;

  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'failed'),
         count(*)
  INTO v_sms_pending, v_sms_failed, v_sms_total
  FROM public.sms_delivery_queue
  WHERE created_at > now() - interval '1 hour';

  v_sms_sla := CASE WHEN v_sms_total > 0
    THEN round(((v_sms_total - v_sms_failed)::numeric / v_sms_total) * 100, 2)
    ELSE 100 END;

  SELECT count(*) INTO v_mismatch_count
  FROM public.ledger_mismatches WHERE status = 'unresolved';

  SELECT count(*) FILTER (WHERE last_run_at > now() - (max_delay_minutes || ' minutes')::interval),
         count(*) FILTER (WHERE last_run_at <= now() - (max_delay_minutes || ' minutes')::interval)
  INTO v_cron_ok, v_cron_stale
  FROM public.cron_heartbeats;

  SELECT count(*) FILTER (WHERE status IN ('pending','retrying')),
         count(*) FILTER (WHERE status = 'dead_letter')
  INTO v_events_pending, v_events_dead
  FROM public.system_events
  WHERE created_at > now() - interval '1 hour';

  INSERT INTO public.system_metrics_ts (metric_type, metric_value, metadata) VALUES
    ('health_score', coalesce(v_health_score, 0), '{}'),
    ('sms_sla_percent', v_sms_sla, jsonb_build_object('pending', v_sms_pending, 'failed', v_sms_failed)),
    ('ledger_mismatches', v_mismatch_count, '{}'),
    ('cron_health', v_cron_ok, jsonb_build_object('stale', v_cron_stale)),
    ('event_bus_health', v_events_pending, jsonb_build_object('dead_letter', v_events_dead));

  RETURN jsonb_build_object(
    'health_score', v_health_score,
    'sms_sla', v_sms_sla,
    'ledger_mismatches', v_mismatch_count,
    'cron_ok', v_cron_ok,
    'cron_stale', v_cron_stale,
    'events_pending', v_events_pending,
    'events_dead', v_events_dead,
    'snapshot_at', now()
  );
END;
$$;
