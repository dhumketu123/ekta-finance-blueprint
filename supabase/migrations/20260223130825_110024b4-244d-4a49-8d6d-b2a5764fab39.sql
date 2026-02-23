
-- Fix: Change view to SECURITY INVOKER (default) explicitly
DROP VIEW IF EXISTS public.view_reschedule_prediction_input;

CREATE VIEW public.view_reschedule_prediction_input
WITH (security_invoker = true)
AS
WITH officer_history AS (
  SELECT
    c.officer_id,
    COUNT(*) FILTER (WHERE c.status = 'rescheduled') AS reschedule_total,
    COUNT(*) AS total_commitments,
    ROUND(
      COUNT(*) FILTER (WHERE c.status = 'rescheduled')::NUMERIC /
      NULLIF(COUNT(*), 0) * 100, 2
    ) AS officer_reschedule_pct
  FROM public.commitments c
  WHERE c.commitment_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY c.officer_id
),
client_history AS (
  SELECT
    c.client_id,
    COUNT(*) FILTER (WHERE c.status = 'rescheduled') AS client_reschedule_count,
    COUNT(*) FILTER (WHERE c.status != 'fulfilled') AS client_unfulfilled_count
  FROM public.commitments c
  WHERE c.commitment_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY c.client_id
),
weekday_pattern AS (
  SELECT
    EXTRACT(DOW FROM c.commitment_date)::INTEGER AS day_of_week,
    ROUND(
      COUNT(*) FILTER (WHERE c.status = 'rescheduled')::NUMERIC /
      NULLIF(COUNT(*), 0) * 100, 2
    ) AS weekday_reschedule_pct
  FROM public.commitments c
  WHERE c.commitment_date >= CURRENT_DATE - INTERVAL '60 days'
  GROUP BY EXTRACT(DOW FROM c.commitment_date)
)
SELECT
  cm.id AS commitment_id,
  cm.client_id,
  cm.officer_id,
  cm.commitment_date,
  COALESCE(oh.officer_reschedule_pct, 0) AS officer_reschedule_pct,
  COALESCE(ch.client_reschedule_count, 0) AS client_reschedule_count,
  COALESCE(ch.client_unfulfilled_count, 0) AS client_unfulfilled_count,
  COALESCE(wp.weekday_reschedule_pct, 0) AS weekday_reschedule_pct,
  LEAST(1.0, ROUND((
    COALESCE(oh.officer_reschedule_pct, 0) * 0.3 +
    COALESCE(ch.client_reschedule_count, 0) * 8 +
    COALESCE(wp.weekday_reschedule_pct, 0) * 0.2
  ) / 100.0, 3)) AS probability_score
FROM public.commitments cm
LEFT JOIN officer_history oh ON oh.officer_id = cm.officer_id
LEFT JOIN client_history ch ON ch.client_id = cm.client_id
LEFT JOIN weekday_pattern wp ON wp.day_of_week = EXTRACT(DOW FROM cm.commitment_date)::INTEGER
WHERE cm.status = 'pending'
  AND cm.commitment_date >= CURRENT_DATE;
