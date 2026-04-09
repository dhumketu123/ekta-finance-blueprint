CREATE OR REPLACE FUNCTION public.refresh_ai_views_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Single-row views: use non-concurrent refresh (constant unique index not supported by CONCURRENTLY)
    BEGIN
        REFRESH MATERIALIZED VIEW public.ai_system_health_mat;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('ai_system_health_refresh', 'failed', jsonb_build_object('error', SQLERRM));
    END;

    BEGIN
        REFRESH MATERIALIZED VIEW public.ai_dashboard_metrics_mat;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('ai_dashboard_refresh', 'failed', jsonb_build_object('error', SQLERRM));
    END;

    -- Multi-row view with proper unique index: use CONCURRENTLY
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_decision_scores_mat;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('ai_decision_scores_refresh', 'failed', jsonb_build_object('error', SQLERRM));
    END;
END;
$$;