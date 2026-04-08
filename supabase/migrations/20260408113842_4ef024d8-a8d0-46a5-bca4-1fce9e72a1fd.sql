
-- 1) Insight type constraint
ALTER TABLE public.ai_insights
DROP CONSTRAINT IF EXISTS ai_insights_type_check;

ALTER TABLE public.ai_insights
ADD CONSTRAINT ai_insights_type_check
CHECK (insight_type IN ('risk', 'dependency_warning', 'anomaly'));

-- 2) Recreate materialized view with last_engine_run
DROP MATERIALIZED VIEW IF EXISTS public.ai_system_health_mat;

CREATE MATERIALIZED VIEW public.ai_system_health_mat AS
SELECT
  (SELECT count(*) FROM public.system_dna WHERE is_deleted = false) AS total_entities,
  (SELECT count(*) FROM public.system_dna WHERE is_active = true AND is_deleted = false) AS active_entities,
  (SELECT ROUND(AVG(criticality_score)::numeric, 1) FROM public.system_dna WHERE is_deleted = false) AS avg_criticality,
  (SELECT count(*) FROM public.system_dna WHERE criticality_score >= 4 AND is_deleted = false) AS high_risk_entities,
  (SELECT COALESCE(SUM(severity_score),0) FROM public.ai_insights WHERE status='active') AS weighted_risk_score,
  (SELECT max(changed_at) FROM public.system_dna_history) AS last_snapshot_time,
  (SELECT max(created_at) FROM public.ai_insights WHERE metadata->>'auto_generated'='true') AS last_engine_run,
  now() AS refreshed_at;

CREATE UNIQUE INDEX idx_ai_system_health_mat_single
ON public.ai_system_health_mat ((1));

-- Update refresh function
CREATE OR REPLACE FUNCTION public.refresh_ai_system_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.ai_system_health_mat;
END;
$$;
