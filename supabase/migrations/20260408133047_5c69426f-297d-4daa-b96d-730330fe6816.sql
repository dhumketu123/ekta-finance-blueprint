
-- Alert table for pipeline health warnings
CREATE TABLE IF NOT EXISTS public.ai_pipeline_alerts (
    id serial PRIMARY KEY,
    alert_time timestamptz NOT NULL DEFAULT now(),
    severity text NOT NULL DEFAULT 'warning',
    message text
);

ALTER TABLE public.ai_pipeline_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_pipeline_alerts"
ON public.ai_pipeline_alerts FOR SELECT
TO authenticated
USING (is_admin_or_owner());

CREATE POLICY "block_anon_pipeline_alerts"
ON public.ai_pipeline_alerts FOR SELECT
TO anon
USING (false);

CREATE POLICY "block_update_pipeline_alerts"
ON public.ai_pipeline_alerts FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "block_delete_pipeline_alerts"
ON public.ai_pipeline_alerts FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "service_role_insert_pipeline_alerts"
ON public.ai_pipeline_alerts FOR INSERT
TO service_role
WITH CHECK (true);

-- Updated health check: now logs alerts
CREATE OR REPLACE FUNCTION public.check_ai_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    last_run record;
    result jsonb;
BEGIN
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
            'last_run_at', null
        );
    ELSIF last_run.status != 'completed' THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('warning', format('Last AI pipeline run failed or incomplete: %s', last_run.remarks));
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last run status: %s - %s', last_run.status, last_run.remarks),
            'last_run_at', last_run.run_at
        );
    ELSIF last_run.run_at < now() - interval '2 hours' THEN
        INSERT INTO public.ai_pipeline_alerts(severity, message)
        VALUES ('warning', 'Last successful run was over 2 hours ago');
        result := jsonb_build_object(
            'healthy', false,
            'reason', 'Last successful run was over 2 hours ago',
            'last_run_at', last_run.run_at
        );
    ELSE
        result := jsonb_build_object(
            'healthy', true,
            'reason', 'Pipeline running normally',
            'last_run_at', last_run.run_at
        );
    END IF;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO service_role;
