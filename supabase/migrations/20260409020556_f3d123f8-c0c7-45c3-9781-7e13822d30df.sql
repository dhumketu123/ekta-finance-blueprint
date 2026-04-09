
-- ═══════════════════════════════════════════════════
-- 1. ai_pipeline_config — SLA configuration table
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_pipeline_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    max_stale_minutes integer NOT NULL DEFAULT 120,
    max_active_insights integer NOT NULL DEFAULT 200,
    alert_escalation_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_pipeline_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_pipeline_config"
ON public.ai_pipeline_config FOR SELECT
TO authenticated
USING (is_admin_or_owner());

CREATE POLICY "block_anon_pipeline_config"
ON public.ai_pipeline_config FOR SELECT
TO anon
USING (false);

CREATE POLICY "service_role_all_pipeline_config"
ON public.ai_pipeline_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "admin_owner_manage_pipeline_config"
ON public.ai_pipeline_config FOR ALL
TO authenticated
USING (is_admin_or_owner())
WITH CHECK (is_admin_or_owner());

-- Seed default config row
INSERT INTO public.ai_pipeline_config (max_stale_minutes, max_active_insights, alert_escalation_enabled)
VALUES (120, 200, true);

-- ═══════════════════════════════════════════════════
-- 2. ai_pipeline_versions — Changelog table
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_pipeline_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version text NOT NULL,
    deployed_at timestamptz NOT NULL DEFAULT now(),
    changes_summary text,
    deployed_by text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_pipeline_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_pipeline_versions"
ON public.ai_pipeline_versions FOR SELECT
TO authenticated
USING (is_admin_or_owner());

CREATE POLICY "block_anon_pipeline_versions"
ON public.ai_pipeline_versions FOR SELECT
TO anon
USING (false);

CREATE POLICY "service_role_all_pipeline_versions"
ON public.ai_pipeline_versions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "admin_owner_insert_pipeline_versions"
ON public.ai_pipeline_versions FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_owner());

-- ═══════════════════════════════════════════════════
-- 3. Add escalation_sent_at to ai_pipeline_alerts
-- ═══════════════════════════════════════════════════
ALTER TABLE public.ai_pipeline_alerts
ADD COLUMN IF NOT EXISTS escalation_sent_at timestamptz DEFAULT NULL;

-- Allow service_role to update escalation timestamp
CREATE POLICY "service_role_update_pipeline_alerts"
ON public.ai_pipeline_alerts FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 4. Escalate critical alerts function
-- ═══════════════════════════════════════════════════
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
    -- Check if escalation is enabled
    SELECT * INTO config_row FROM public.ai_pipeline_config LIMIT 1;
    IF config_row IS NULL OR NOT config_row.alert_escalation_enabled THEN
        RETURN jsonb_build_object('escalated', 0, 'reason', 'Escalation disabled or no config');
    END IF;

    -- Find unescalated critical alerts from last 24h
    FOR alert_rec IN
        SELECT id, message, alert_time
        FROM public.ai_pipeline_alerts
        WHERE severity = 'critical'
          AND escalation_sent_at IS NULL
          AND alert_time > now() - interval '24 hours'
        ORDER BY alert_time DESC
        LIMIT 10
    LOOP
        -- Send in-app notification to all admins
        INSERT INTO public.in_app_notifications (user_id, tenant_id, title, message, event_type, source_module, role, priority)
        SELECT
            p.id,
            p.tenant_id,
            '🚨 Pipeline Critical Escalation',
            format('Critical alert at %s: %s', alert_rec.alert_time::text, COALESCE(alert_rec.message, 'Unknown')),
            'pipeline_escalation',
            'ai-pipeline',
            'admin',
            'CRITICAL'
        FROM public.profiles p
        WHERE p.role IN ('admin', 'owner')
        LIMIT 10;

        -- Mark as escalated
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

-- ═══════════════════════════════════════════════════
-- 5. Updated check_ai_pipeline_health() — reads from config
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_ai_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    last_run record;
    config_row record;
    stale_interval interval;
    result jsonb;
BEGIN
    -- Load config (fallback to defaults)
    SELECT * INTO config_row FROM public.ai_pipeline_config LIMIT 1;
    stale_interval := make_interval(mins => COALESCE(config_row.max_stale_minutes, 120));

    SELECT * INTO last_run
    FROM public.ai_pipeline_runs
    ORDER BY run_at DESC
    LIMIT 1;

    IF last_run IS NULL THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('critical', 'No pipeline runs found');
        result := jsonb_build_object(
            'healthy', false,
            'reason', 'No pipeline runs found',
            'last_run_at', null,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    ELSIF last_run.status != 'completed' THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('warning', format('Last AI pipeline run failed or incomplete: %s', last_run.remarks));
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last run status: %s - %s', last_run.status, last_run.remarks),
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    ELSIF last_run.run_at < now() - stale_interval THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('warning', format('Last successful run was over %s minutes ago', COALESCE(config_row.max_stale_minutes, 120)));
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

    -- Auto-escalate critical alerts if enabled
    IF config_row IS NOT NULL AND config_row.alert_escalation_enabled THEN
        PERFORM public.escalate_critical_alerts();
    END IF;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO service_role;

-- ═══════════════════════════════════════════════════
-- 6. Cron verification guard (weekly)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.verify_required_cron_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    required_jobs text[] := ARRAY[
        'ai_pipeline_hourly',
        'refresh_system_health_15m',
        'refresh_dashboard_metrics_15m',
        'ai_pipeline_health_check_2hr'
    ];
    job_name text;
    missing_jobs text[] := '{}';
    found boolean;
BEGIN
    FOREACH job_name IN ARRAY required_jobs LOOP
        SELECT EXISTS(
            SELECT 1 FROM cron.job WHERE jobname = job_name AND active = true
        ) INTO found;

        IF NOT found THEN
            missing_jobs := array_append(missing_jobs, job_name);
        END IF;
    END LOOP;

    IF array_length(missing_jobs, 1) > 0 THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('critical', format('Missing or inactive cron jobs: %s', array_to_string(missing_jobs, ', ')));

        RETURN jsonb_build_object(
            'status', 'missing_jobs',
            'missing', to_jsonb(missing_jobs),
            'checked_at', now()
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'all_present',
        'checked_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_required_cron_jobs() TO service_role;

-- ═══════════════════════════════════════════════════
-- 7. Index audit function (quarterly)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.audit_missing_indexes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec record;
    recommendations jsonb := '[]'::jsonb;
BEGIN
    -- Find tables in public schema with >1000 rows but no indexes beyond PK
    FOR rec IN
        SELECT
            t.relname AS table_name,
            pg_catalog.pg_relation_size(t.oid) AS table_size_bytes,
            (SELECT count(*) FROM pg_index WHERE indrelid = t.oid) AS index_count
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relkind = 'r'
          AND pg_catalog.pg_relation_size(t.oid) > 100000
          AND (SELECT count(*) FROM pg_index WHERE indrelid = t.oid) <= 1
    LOOP
        recommendations := recommendations || jsonb_build_object(
            'table', rec.table_name,
            'size_bytes', rec.table_size_bytes,
            'index_count', rec.index_count,
            'recommendation', format('Table %s has %s index(es) but is %s bytes — consider adding indexes', rec.table_name, rec.index_count, rec.table_size_bytes)
        );
    END LOOP;

    -- Find potentially unused indexes (low idx_scan)
    FOR rec IN
        SELECT
            schemaname,
            relname AS table_name,
            indexrelname AS index_name,
            idx_scan
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
          AND idx_scan < 10
          AND indexrelname NOT LIKE '%pkey%'
          AND indexrelname NOT LIKE '%unique%'
        ORDER BY idx_scan ASC
        LIMIT 20
    LOOP
        recommendations := recommendations || jsonb_build_object(
            'table', rec.table_name,
            'index', rec.index_name,
            'scans', rec.idx_scan,
            'recommendation', format('Index %s on %s has only %s scans — consider dropping', rec.index_name, rec.table_name, rec.idx_scan)
        );
    END LOOP;

    -- Log alert if recommendations found
    IF jsonb_array_length(recommendations) > 0 THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('info', format('Index audit found %s recommendations', jsonb_array_length(recommendations)));
    END IF;

    RETURN jsonb_build_object(
        'recommendations_count', jsonb_array_length(recommendations),
        'recommendations', recommendations,
        'audited_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_missing_indexes() TO service_role;

-- Seed initial version entry
INSERT INTO public.ai_pipeline_versions (version, changes_summary, deployed_by)
VALUES ('2.0.0', 'Added: SLA config, alert escalation, cron verification guard, index audit, changelog tracking', 'system');
