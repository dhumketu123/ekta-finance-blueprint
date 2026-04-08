
-- 1️⃣ Materialized view for AI dashboard metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ai_dashboard_metrics_mat
AS
SELECT
    COUNT(*) FILTER (WHERE ai.status = 'active') AS active_insights_count,
    COUNT(*) FILTER (WHERE ai.status = 'resolved') AS resolved_insights_count,
    COUNT(*) FILTER (WHERE ai.status = 'dismissed') AS dismissed_insights_count,
    COALESCE(SUM(ai.priority_score), 0) AS weighted_risk_score,
    MAX(ai.created_at) FILTER (WHERE ai.metadata->>'auto_generated'='true') AS last_engine_run,
    MAX(h.changed_at) AS last_snapshot_time,
    COUNT(*) FILTER (WHERE ai.is_locked = true) AS locked_insights_count,
    COUNT(*) FILTER (WHERE ai.created_at < now() - interval '30 days') AS stale_insights_count
FROM public.ai_insights ai
LEFT JOIN public.system_dna_history h
    ON h.dna_id = ai.entity_id;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_ai_dashboard_metrics_mat_single
ON public.ai_dashboard_metrics_mat ((1));

-- 2️⃣ Index for fast lookup by weighted risk
CREATE INDEX IF NOT EXISTS idx_ai_dashboard_metrics_weighted
ON public.ai_dashboard_metrics_mat (weighted_risk_score DESC);

-- 3️⃣ Refresh function (concurrent when possible)
CREATE OR REPLACE FUNCTION public.refresh_ai_dashboard_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_dashboard_metrics_mat;
    EXCEPTION WHEN OTHERS THEN
        REFRESH MATERIALIZED VIEW public.ai_dashboard_metrics_mat;
    END;
END;
$$;

-- 4️⃣ Grant execute to relevant roles
GRANT EXECUTE ON FUNCTION public.refresh_ai_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ai_dashboard_metrics() TO service_role;
