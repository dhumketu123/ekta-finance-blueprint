
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Pipeline run tracking table
CREATE TABLE IF NOT EXISTS public.ai_pipeline_runs (
    id serial PRIMARY KEY,
    run_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'started',
    remarks text
);

ALTER TABLE public.ai_pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Append-only: only service_role can insert
CREATE POLICY "service_role_insert_pipeline_runs"
ON public.ai_pipeline_runs FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "admin_owner_read_pipeline_runs"
ON public.ai_pipeline_runs FOR SELECT
TO authenticated
USING (is_admin_or_owner());

CREATE POLICY "block_update_pipeline_runs"
ON public.ai_pipeline_runs FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "block_delete_pipeline_runs"
ON public.ai_pipeline_runs FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "block_anon_pipeline_runs"
ON public.ai_pipeline_runs FOR SELECT
TO anon
USING (false);

-- Health check function
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
        result := jsonb_build_object(
            'healthy', false,
            'reason', 'No pipeline runs found',
            'last_run_at', null
        );
    ELSIF last_run.status != 'completed' THEN
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last run status: %s - %s', last_run.status, last_run.remarks),
            'last_run_at', last_run.run_at
        );
    ELSIF last_run.run_at < now() - interval '2 hours' THEN
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
