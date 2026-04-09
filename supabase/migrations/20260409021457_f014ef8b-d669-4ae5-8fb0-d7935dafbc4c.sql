
CREATE OR REPLACE FUNCTION public.escalate_critical_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    alert_rec record;
    escalated_count integer := 0;
    config_row record;
BEGIN
    SELECT * INTO config_row FROM public.ai_pipeline_config LIMIT 1;
    IF config_row IS NULL OR NOT config_row.alert_escalation_enabled THEN
        RETURN jsonb_build_object('escalated', 0, 'reason', 'Escalation disabled or no config');
    END IF;

    FOR alert_rec IN
        SELECT id, message, alert_time
        FROM public.ai_pipeline_alerts
        WHERE severity = 'critical'
          AND escalation_sent_at IS NULL
          AND alert_time > now() - interval '24 hours'
        ORDER BY alert_time DESC
        LIMIT 10
    LOOP
        INSERT INTO public.in_app_notifications (user_id, tenant_id, title, message, event_type, source_module, role, priority)
        SELECT
            p.id,
            p.tenant_id,
            '🚨 Pipeline Critical Escalation',
            format('Critical alert at %s: %s', alert_rec.alert_time::text, COALESCE(alert_rec.message, 'Unknown')),
            'pipeline_escalation',
            'ai-pipeline',
            'admin',
            'HIGH'
        FROM public.profiles p
        WHERE p.role IN ('admin', 'owner')
        LIMIT 10;

        UPDATE public.ai_pipeline_alerts
        SET escalation_sent_at = now()
        WHERE id = alert_rec.id;

        escalated_count := escalated_count + 1;
    END LOOP;

    RETURN jsonb_build_object('escalated', escalated_count, 'timestamp', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.escalate_critical_alerts() TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_critical_alerts() TO authenticated;
