CREATE OR REPLACE FUNCTION public.check_ai_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    last_run         record;
    config_row       record;
    stale_interval   interval;
    result           jsonb;
    v_start          timestamptz := clock_timestamp();
    v_alerts_count   integer := 0;
    v_inserted       boolean;
    v_heartbeat_ok   boolean := false;
    v_registry_ok    boolean := false;
BEGIN
    SELECT * INTO config_row FROM public.ai_pipeline_config LIMIT 1;
    stale_interval := make_interval(mins => COALESCE(config_row.max_stale_minutes, 120));

    SELECT * INTO last_run
    FROM public.ai_pipeline_runs
    ORDER BY run_at DESC
    LIMIT 1;

    -- Independent liveness signals
    SELECT EXISTS (
        SELECT 1 FROM public.cron_heartbeats
        WHERE job_name ILIKE '%pipeline%'
          AND last_run_at > now() - interval '6 hours'
          AND status = 'ok'
    ) INTO v_heartbeat_ok;

    SELECT EXISTS (
        SELECT 1 FROM public.execution_registry
        WHERE entity_type ILIKE '%pipeline%'
          AND is_active = true
    ) INTO v_registry_ok;

    IF last_run IS NULL THEN
        IF v_heartbeat_ok OR v_registry_ok THEN
            result := jsonb_build_object(
                'healthy', true,
                'reason', 'No completed runs yet, but heartbeat/registry indicate pipeline is alive',
                'last_run_at', null,
                'heartbeat_ok', v_heartbeat_ok,
                'registry_ok', v_registry_ok,
                'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
            );
        ELSE
            SELECT public.insert_deduplicated_alert(
                'warning',
                'No pipeline runs found and no recent heartbeat/registry entry',
                'health_no_runs',
                60
            ) INTO v_inserted;
            IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;

            result := jsonb_build_object(
                'healthy', false,
                'reason', 'No pipeline runs and no heartbeat/registry signal',
                'last_run_at', null,
                'heartbeat_ok', false,
                'registry_ok', false,
                'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
            );
        END IF;

    ELSIF last_run.status != 'completed' THEN
        SELECT public.insert_deduplicated_alert(
            'warning',
            format('Last AI pipeline run failed or incomplete: %s', last_run.remarks),
            'health_run_failed',
            COALESCE(config_row.max_stale_minutes, 120)
        ) INTO v_inserted;
        IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last run status: %s - %s', last_run.status, last_run.remarks),
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );

    ELSIF last_run.run_at < now() - stale_interval THEN
        SELECT public.insert_deduplicated_alert(
            'warning',
            format('Last successful run was over %s minutes ago', COALESCE(config_row.max_stale_minutes, 120)),
            'health_stale_run',
            COALESCE(config_row.max_stale_minutes, 120)
        ) INTO v_inserted;
        IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last successful run was over %s minutes ago', COALESCE(config_row.max_stale_minutes, 120)),
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );

    ELSE
        result := jsonb_build_object(
            'healthy', true,
            'reason', 'Pipeline running normally',
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    END IF;

    IF config_row IS NOT NULL AND config_row.alert_escalation_enabled THEN
        PERFORM public.escalate_critical_alerts();
    END IF;

    INSERT INTO public.ai_pipeline_metrics(metric_type, duration_ms, alerts_generated, status)
    VALUES (
        'health_check',
        extract(milliseconds from clock_timestamp() - v_start)::integer,
        v_alerts_count,
        CASE WHEN (result->>'healthy')::boolean THEN 'success' ELSE 'unhealthy' END
    );

    RETURN result;
END;
$function$;