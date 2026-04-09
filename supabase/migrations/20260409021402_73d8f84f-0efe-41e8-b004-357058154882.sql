
-- Fix Security Definer View warning
DROP VIEW IF EXISTS public.ai_pipeline_trend_24h;

CREATE VIEW public.ai_pipeline_trend_24h
WITH (security_invoker = true)
AS
SELECT
    date_trunc('hour', recorded_at) AS hour_bucket,
    count(*) AS run_count,
    round(avg(duration_ms)::numeric, 1) AS avg_duration_ms,
    sum(insights_generated) AS total_insights,
    sum(alerts_generated) AS total_alerts,
    round(
        (count(*) FILTER (WHERE status != 'success') * 100.0 / NULLIF(count(*), 0))::numeric, 1
    ) AS failure_rate_pct
FROM public.ai_pipeline_metrics
WHERE recorded_at > now() - interval '24 hours'
  AND metric_type = 'pipeline_run'
GROUP BY date_trunc('hour', recorded_at)
ORDER BY hour_bucket DESC;
