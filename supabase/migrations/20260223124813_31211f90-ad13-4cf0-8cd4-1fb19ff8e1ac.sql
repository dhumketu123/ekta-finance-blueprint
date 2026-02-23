
-- ═══════════════════════════════════════════════════════════
-- Phase 2.6: Analytics Intelligence Views + Alerting Layer
-- ═══════════════════════════════════════════════════════════

-- 1️⃣ Swipe Success Rate View
CREATE OR REPLACE VIEW public.view_swipe_success_rate AS
SELECT
  date_trunc('day', created_at)::date AS report_date,
  COUNT(*) FILTER (WHERE action_type IN ('swipe_fulfill', 'reschedule_confirm')) AS total_success,
  COUNT(*) FILTER (WHERE action_type IN ('swipe_fulfill_failed', 'reschedule_failed')) AS total_failed,
  COUNT(*) AS total_actions,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE action_type IN ('swipe_fulfill', 'reschedule_confirm'))::numeric / COUNT(*)::numeric) * 100, 2
    )
    ELSE 0
  END AS success_rate_pct
FROM public.commitment_analytics
WHERE action_type IN ('swipe_fulfill', 'reschedule_confirm', 'swipe_fulfill_failed', 'reschedule_failed')
GROUP BY report_date
ORDER BY report_date DESC;

-- 2️⃣ Reschedule Rate View
CREATE OR REPLACE VIEW public.view_reschedule_rate AS
SELECT
  date_trunc('day', created_at)::date AS report_date,
  COUNT(*) FILTER (WHERE action_type = 'reschedule_confirm') AS reschedule_count,
  COUNT(*) FILTER (WHERE action_type = 'swipe_fulfill') AS fulfill_count,
  CASE WHEN (COUNT(*) FILTER (WHERE action_type IN ('reschedule_confirm', 'swipe_fulfill'))) > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE action_type = 'reschedule_confirm')::numeric /
       NULLIF(COUNT(*) FILTER (WHERE action_type IN ('reschedule_confirm', 'swipe_fulfill')), 0)::numeric) * 100, 2
    )
    ELSE 0
  END AS reschedule_rate_pct
FROM public.commitment_analytics
WHERE action_type IN ('reschedule_confirm', 'swipe_fulfill')
GROUP BY report_date
ORDER BY report_date DESC;

-- 3️⃣ AI Chip Usage View
CREATE OR REPLACE VIEW public.view_ai_chip_usage AS
SELECT
  action_metadata->>'chip_label' AS chip_label,
  action_metadata->>'chip_date' AS chip_date,
  COUNT(*) AS usage_count,
  COUNT(DISTINCT user_id) AS unique_users
FROM public.commitment_analytics
WHERE action_type = 'ai_chip_select'
  AND action_metadata->>'chip_label' IS NOT NULL
GROUP BY chip_label, chip_date
ORDER BY usage_count DESC;

-- 4️⃣ Officer Performance Summary View
CREATE OR REPLACE VIEW public.view_officer_performance_summary AS
SELECT
  ca.user_id AS officer_id,
  p.name_bn AS officer_name_bn,
  p.name_en AS officer_name_en,
  COUNT(*) FILTER (WHERE ca.action_type = 'swipe_fulfill') AS total_fulfilled,
  COUNT(*) FILTER (WHERE ca.action_type = 'reschedule_confirm') AS total_rescheduled,
  COUNT(*) FILTER (WHERE ca.action_type IN ('swipe_fulfill_failed', 'reschedule_failed')) AS total_failures,
  COUNT(*) AS total_actions,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(
      (COUNT(*) FILTER (WHERE ca.action_type = 'swipe_fulfill')::numeric / COUNT(*)::numeric) * 100, 2
    )
    ELSE 0
  END AS fulfillment_rate_pct,
  ROUND(AVG(
    CASE WHEN ca.action_type = 'reschedule_confirm'
    THEN (ca.action_metadata->>'reason_length')::numeric ELSE NULL END
  ), 1) AS avg_reason_length
FROM public.commitment_analytics ca
LEFT JOIN public.profiles p ON p.id = ca.user_id
GROUP BY ca.user_id, p.name_bn, p.name_en
ORDER BY total_fulfilled DESC;

-- ═══════════════════════════════════════════════════════════
-- 5️⃣ System Alerts Table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL, -- 'high_failure_rate', 'reschedule_spike', 'officer_repeated_failures'
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  title TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_alerts_type ON public.system_alerts(alert_type);
CREATE INDEX idx_system_alerts_unresolved ON public.system_alerts(is_resolved) WHERE is_resolved = false;

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access system_alerts"
  ON public.system_alerts
  AS RESTRICTIVE
  FOR ALL
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Treasurer view system_alerts"
  ON public.system_alerts
  AS RESTRICTIVE
  FOR SELECT
  USING (is_treasurer());

-- ═══════════════════════════════════════════════════════════
-- 6️⃣ Alert Threshold Check Function
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_commitment_alert_thresholds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_failure_rate NUMERIC;
  v_reschedule_rate NUMERIC;
  v_alerts_created INT := 0;
  v_officer RECORD;
BEGIN
  -- Check failure rate (last 24h)
  SELECT
    CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE action_type IN ('swipe_fulfill_failed', 'reschedule_failed'))::numeric / COUNT(*)::numeric) * 100, 2)
      ELSE 0
    END INTO v_failure_rate
  FROM commitment_analytics
  WHERE created_at > now() - interval '24 hours'
    AND action_type IN ('swipe_fulfill', 'reschedule_confirm', 'swipe_fulfill_failed', 'reschedule_failed');

  IF v_failure_rate > 5 THEN
    INSERT INTO system_alerts (alert_type, severity, title, details)
    VALUES ('high_failure_rate', 'critical',
      'Commitment failure rate exceeds 5%',
      jsonb_build_object('failure_rate', v_failure_rate, 'period', '24h')
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  -- Check reschedule spike (last 24h)
  SELECT
    CASE WHEN (COUNT(*) FILTER (WHERE action_type IN ('reschedule_confirm', 'swipe_fulfill'))) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE action_type = 'reschedule_confirm')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE action_type IN ('reschedule_confirm', 'swipe_fulfill')), 0)::numeric) * 100, 2)
      ELSE 0
    END INTO v_reschedule_rate
  FROM commitment_analytics
  WHERE created_at > now() - interval '24 hours'
    AND action_type IN ('reschedule_confirm', 'swipe_fulfill');

  IF v_reschedule_rate > 40 THEN
    INSERT INTO system_alerts (alert_type, severity, title, details)
    VALUES ('reschedule_spike', 'warning',
      'Reschedule rate exceeds 40%',
      jsonb_build_object('reschedule_rate', v_reschedule_rate, 'period', '24h')
    );
    v_alerts_created := v_alerts_created + 1;
  END IF;

  -- Check officer repeated failures (3+ in last 24h)
  FOR v_officer IN
    SELECT user_id, COUNT(*) AS fail_count
    FROM commitment_analytics
    WHERE created_at > now() - interval '24 hours'
      AND action_type IN ('swipe_fulfill_failed', 'reschedule_failed')
    GROUP BY user_id
    HAVING COUNT(*) >= 3
  LOOP
    INSERT INTO system_alerts (alert_type, severity, title, details)
    VALUES ('officer_repeated_failures', 'warning',
      'Officer has 3+ failures in 24h',
      jsonb_build_object('officer_id', v_officer.user_id, 'failure_count', v_officer.fail_count)
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_alerts_created, 'checked_at', now());
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 7️⃣ Max Reschedule Limit (server-side)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.check_reschedule_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reschedule_count INT;
BEGIN
  -- Only check when status is changing to 'rescheduled'
  IF NEW.status = 'rescheduled' AND (OLD.status IS DISTINCT FROM 'rescheduled') THEN
    -- Count how many times this client+officer pair has rescheduled
    SELECT COUNT(*) INTO v_reschedule_count
    FROM commitments
    WHERE client_id = NEW.client_id
      AND officer_id = NEW.officer_id
      AND status = 'rescheduled';

    IF v_reschedule_count >= 10 THEN
      RAISE EXCEPTION 'Maximum reschedule limit (10) reached for this client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commitment_reschedule_limit
  BEFORE UPDATE ON public.commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reschedule_limit();
