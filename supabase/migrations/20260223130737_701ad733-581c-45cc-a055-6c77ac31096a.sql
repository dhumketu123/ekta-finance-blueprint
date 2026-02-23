
-- ============================================
-- Phase 2.8: Predictive & Preventive Intelligence (Fixed)
-- ============================================

-- 1️⃣ Client Risk Table (already created by partial migration, use IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.client_risk (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  risk_level TEXT NOT NULL DEFAULT 'medium',
  reschedule_count_30d INTEGER NOT NULL DEFAULT 0,
  overdue_frequency INTEGER NOT NULL DEFAULT 0,
  probability_score NUMERIC NOT NULL DEFAULT 0,
  flagged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_risk ENABLE ROW LEVEL SECURITY;

-- RLS (use IF NOT EXISTS pattern via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_risk' AND policyname = 'Admin/owner full access client_risk') THEN
    CREATE POLICY "Admin/owner full access client_risk" ON public.client_risk FOR ALL USING (is_admin_or_owner()) WITH CHECK (is_admin_or_owner());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_risk' AND policyname = 'Treasurer view client_risk') THEN
    CREATE POLICY "Treasurer view client_risk" ON public.client_risk FOR SELECT USING (is_treasurer());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_risk' AND policyname = 'Field officers view assigned client_risk') THEN
    CREATE POLICY "Field officers view assigned client_risk" ON public.client_risk FOR SELECT USING (is_field_officer() AND is_assigned_to_client(client_id));
  END IF;
END $$;

-- 2️⃣ Officer Burnout columns (already added by partial migration)
ALTER TABLE public.officer_metrics
  ADD COLUMN IF NOT EXISTS weekly_commitment_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS burnout_risk BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS burnout_flagged_at TIMESTAMP WITH TIME ZONE;

-- 3️⃣ Predictive Reschedule Input View (FIXED: no 'failed' status)
CREATE OR REPLACE VIEW public.view_reschedule_prediction_input AS
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

-- 4️⃣ Function: Detect high-risk clients
CREATE OR REPLACE FUNCTION public.detect_high_risk_clients()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  flagged_count INTEGER := 0;
  result JSONB;
BEGIN
  INSERT INTO public.client_risk (client_id, risk_level, reschedule_count_30d, probability_score, overdue_frequency)
  SELECT
    c.client_id,
    CASE
      WHEN COUNT(*) >= 6 THEN 'critical'
      WHEN COUNT(*) >= 4 THEN 'high'
      ELSE 'elevated'
    END,
    COUNT(*)::INTEGER,
    LEAST(1.0, ROUND(COUNT(*)::NUMERIC / 10.0, 3)),
    COALESCE((
      SELECT COUNT(*) FROM public.loan_schedules ls
      WHERE ls.client_id = c.client_id AND ls.status = 'overdue'
    ), 0)::INTEGER
  FROM public.commitments c
  WHERE c.status = 'rescheduled'
    AND c.commitment_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY c.client_id
  HAVING COUNT(*) > 3
  ON CONFLICT (client_id) DO UPDATE SET
    risk_level = EXCLUDED.risk_level,
    reschedule_count_30d = EXCLUDED.reschedule_count_30d,
    probability_score = EXCLUDED.probability_score,
    overdue_frequency = EXCLUDED.overdue_frequency,
    updated_at = now();

  GET DIAGNOSTICS flagged_count = ROW_COUNT;

  INSERT INTO public.system_alerts (alert_type, severity, title, details)
  SELECT
    'high_risk_client',
    CASE WHEN cr.risk_level = 'critical' THEN 'critical' ELSE 'warning' END,
    'High-risk client detected: ' || cl.name_en,
    jsonb_build_object(
      'client_id', cr.client_id,
      'risk_level', cr.risk_level,
      'reschedule_count_30d', cr.reschedule_count_30d,
      'probability_score', cr.probability_score
    )
  FROM public.client_risk cr
  JOIN public.clients cl ON cl.id = cr.client_id
  WHERE cr.risk_level IN ('critical', 'high')
    AND cr.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.system_alerts sa
      WHERE sa.alert_type = 'high_risk_client'
        AND sa.is_resolved = false
        AND (sa.details->>'client_id')::UUID = cr.client_id
    );

  result := jsonb_build_object('flagged_clients', flagged_count);
  RETURN result;
END;
$$;

-- 5️⃣ Function: Detect officer burnout
CREATE OR REPLACE FUNCTION public.detect_officer_burnout(
  _weekly_threshold INTEGER DEFAULT 50,
  _failure_threshold NUMERIC DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  flagged_count INTEGER := 0;
  result JSONB;
BEGIN
  UPDATE public.officer_metrics om SET
    weekly_commitment_count = sub.weekly_count,
    burnout_risk = (sub.weekly_count >= _weekly_threshold AND om.failure_rate >= _failure_threshold),
    burnout_flagged_at = CASE
      WHEN (sub.weekly_count >= _weekly_threshold AND om.failure_rate >= _failure_threshold) THEN now()
      ELSE om.burnout_flagged_at
    END,
    updated_at = now()
  FROM (
    SELECT
      officer_id,
      COUNT(*)::INTEGER AS weekly_count
    FROM public.commitments
    WHERE commitment_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY officer_id
  ) sub
  WHERE om.officer_id = sub.officer_id;

  SELECT COUNT(*) INTO flagged_count FROM public.officer_metrics WHERE burnout_risk = true;

  INSERT INTO public.system_alerts (alert_type, severity, title, details)
  SELECT
    'officer_burnout',
    'warning',
    'Officer burnout risk: ' || COALESCE(p.name_en, om.officer_id::TEXT),
    jsonb_build_object(
      'officer_id', om.officer_id,
      'weekly_commitments', om.weekly_commitment_count,
      'failure_rate', om.failure_rate,
      'risk_score', om.risk_score
    )
  FROM public.officer_metrics om
  LEFT JOIN public.profiles p ON p.id = om.officer_id
  WHERE om.burnout_risk = true
    AND NOT EXISTS (
      SELECT 1 FROM public.system_alerts sa
      WHERE sa.alert_type = 'officer_burnout'
        AND sa.is_resolved = false
        AND (sa.details->>'officer_id')::UUID = om.officer_id
    );

  result := jsonb_build_object('burnout_flagged', flagged_count);
  RETURN result;
END;
$$;

-- 6️⃣ Function: Generate preventive recommendations
CREATE OR REPLACE FUNCTION public.generate_preventive_recommendations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recommendations JSONB := '[]'::JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(rec), '[]'::JSONB) INTO recommendations
  FROM (
    SELECT jsonb_build_object(
      'type', 'follow_up_call',
      'priority', 'high',
      'target_type', 'client',
      'target_id', cr.client_id,
      'target_name', cl.name_en,
      'reason', 'Rescheduled ' || cr.reschedule_count_30d || ' times in 30 days',
      'action', 'Schedule immediate follow-up call'
    ) AS rec
    FROM public.client_risk cr
    JOIN public.clients cl ON cl.id = cr.client_id
    WHERE cr.risk_level IN ('critical', 'high') AND cr.resolved_at IS NULL

    UNION ALL

    SELECT jsonb_build_object(
      'type', 'redistribute_workload',
      'priority', 'high',
      'target_type', 'officer',
      'target_id', om.officer_id,
      'target_name', COALESCE(p.name_en, 'Unknown'),
      'reason', 'Weekly commitments: ' || om.weekly_commitment_count || ', Failure rate: ' || om.failure_rate || '%',
      'action', 'Redistribute clients to reduce workload'
    ) AS rec
    FROM public.officer_metrics om
    LEFT JOIN public.profiles p ON p.id = om.officer_id
    WHERE om.burnout_risk = true

    UNION ALL

    SELECT jsonb_build_object(
      'type', 'early_reminder',
      'priority', 'medium',
      'target_type', 'commitment',
      'target_id', v.commitment_id,
      'target_name', cl.name_en,
      'reason', 'Reschedule probability: ' || (v.probability_score * 100) || '%',
      'action', 'Send early reminder to client before commitment date'
    ) AS rec
    FROM public.view_reschedule_prediction_input v
    JOIN public.clients cl ON cl.id = v.client_id
    WHERE v.probability_score >= 0.6
    LIMIT 20
  ) recs;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'total_recommendations', jsonb_array_length(recommendations),
    'recommendations', recommendations
  );
END;
$$;
