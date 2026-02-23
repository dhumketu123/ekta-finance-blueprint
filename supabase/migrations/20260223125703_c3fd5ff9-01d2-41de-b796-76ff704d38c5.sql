
-- 1. Executive Reports table
CREATE TABLE public.executive_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type text NOT NULL DEFAULT 'weekly_commitment_summary',
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.executive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access executive_reports"
  ON public.executive_reports AS RESTRICTIVE FOR ALL
  USING (is_admin_or_owner()) WITH CHECK (is_admin_or_owner());

CREATE POLICY "Treasurer view executive_reports"
  ON public.executive_reports AS RESTRICTIVE FOR SELECT
  USING (is_treasurer());

-- 2. Officer Metrics table
CREATE TABLE public.officer_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id uuid NOT NULL,
  risk_score integer NOT NULL DEFAULT 50,
  risk_level text NOT NULL DEFAULT 'medium',
  failure_rate numeric NOT NULL DEFAULT 0,
  reschedule_rate numeric NOT NULL DEFAULT 0,
  alert_frequency integer NOT NULL DEFAULT 0,
  total_commitments integer NOT NULL DEFAULT 0,
  fulfilled_commitments integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.officer_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access officer_metrics"
  ON public.officer_metrics AS RESTRICTIVE FOR ALL
  USING (is_admin_or_owner()) WITH CHECK (is_admin_or_owner());

CREATE POLICY "Treasurer view officer_metrics"
  ON public.officer_metrics AS RESTRICTIVE FOR SELECT
  USING (is_treasurer());

CREATE POLICY "Officers view own metrics"
  ON public.officer_metrics AS RESTRICTIVE FOR SELECT
  USING (officer_id = auth.uid());

CREATE UNIQUE INDEX idx_officer_metrics_officer ON public.officer_metrics(officer_id);
CREATE INDEX idx_executive_reports_period ON public.executive_reports(period_start, period_end);

-- 3. Calculate officer risk score function
CREATE OR REPLACE FUNCTION public.calculate_officer_risk_score(_officer_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rec RECORD;
  _risk_score integer;
  _risk_level text;
  _alert_count integer;
  _result jsonb := '[]'::jsonb;
BEGIN
  FOR _rec IN
    SELECT
      c.officer_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.status = 'fulfilled') AS fulfilled,
      COUNT(*) FILTER (WHERE c.status = 'rescheduled') AS rescheduled,
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.status NOT IN ('fulfilled','pending')) / GREATEST(COUNT(*),1), 2) AS fail_pct,
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.status = 'rescheduled') / GREATEST(COUNT(*),1), 2) AS resched_pct
    FROM commitments c
    WHERE c.created_at >= now() - interval '30 days'
      AND (_officer_id IS NULL OR c.officer_id = _officer_id)
    GROUP BY c.officer_id
  LOOP
    -- Count recent alerts for this officer
    SELECT COUNT(*) INTO _alert_count
    FROM system_alerts
    WHERE alert_type LIKE '%commitment%'
      AND created_at >= now() - interval '30 days'
      AND details->>'officer_id' = _rec.officer_id::text;

    -- Calculate composite risk score (0-100, higher = riskier)
    _risk_score := LEAST(100, GREATEST(0,
      (_rec.fail_pct * 1.5)::integer +
      (_rec.resched_pct * 0.8)::integer +
      (_alert_count * 5)
    ));

    _risk_level := CASE
      WHEN _risk_score >= 70 THEN 'critical'
      WHEN _risk_score >= 40 THEN 'high'
      WHEN _risk_score >= 20 THEN 'medium'
      ELSE 'low'
    END;

    -- Upsert officer_metrics
    INSERT INTO officer_metrics (officer_id, risk_score, risk_level, failure_rate, reschedule_rate, alert_frequency, total_commitments, fulfilled_commitments, calculated_at, updated_at)
    VALUES (_rec.officer_id, _risk_score, _risk_level, _rec.fail_pct, _rec.resched_pct, _alert_count, _rec.total, _rec.fulfilled, now(), now())
    ON CONFLICT (officer_id) DO UPDATE SET
      risk_score = EXCLUDED.risk_score,
      risk_level = EXCLUDED.risk_level,
      failure_rate = EXCLUDED.failure_rate,
      reschedule_rate = EXCLUDED.reschedule_rate,
      alert_frequency = EXCLUDED.alert_frequency,
      total_commitments = EXCLUDED.total_commitments,
      fulfilled_commitments = EXCLUDED.fulfilled_commitments,
      calculated_at = EXCLUDED.calculated_at,
      updated_at = EXCLUDED.updated_at;

    -- Smart flagging: auto-create alert if critical
    IF _risk_score >= 70 THEN
      INSERT INTO system_alerts (alert_type, severity, title, details)
      VALUES (
        'officer_high_risk',
        'critical',
        'Officer risk score critical: ' || _risk_score,
        jsonb_build_object(
          'officer_id', _rec.officer_id,
          'risk_score', _risk_score,
          'failure_rate', _rec.fail_pct,
          'reschedule_rate', _rec.resched_pct,
          'alert_frequency', _alert_count
        )
      );
    END IF;

    _result := _result || jsonb_build_object(
      'officer_id', _rec.officer_id,
      'risk_score', _risk_score,
      'risk_level', _risk_level
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'officers_scored', jsonb_array_length(_result), 'results', _result);
END;
$$;

-- 4. Generate weekly intelligence summary function
CREATE OR REPLACE FUNCTION public.generate_weekly_intelligence_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _period_start date := (now() - interval '7 days')::date;
  _period_end date := now()::date;
  _summary jsonb;
  _top_officers jsonb;
  _high_risk_officers jsonb;
BEGIN
  -- Build summary metrics
  SELECT jsonb_build_object(
    'total_commitments', COUNT(*),
    'fulfilled', COUNT(*) FILTER (WHERE status = 'fulfilled'),
    'rescheduled', COUNT(*) FILTER (WHERE status = 'rescheduled'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'success_rate', ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'fulfilled') / GREATEST(COUNT(*),1), 2),
    'reschedule_rate', ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'rescheduled') / GREATEST(COUNT(*),1), 2)
  ) INTO _summary
  FROM commitments
  WHERE created_at >= _period_start AND created_at < _period_end + interval '1 day';

  -- Top performing officers
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top_officers
  FROM (
    SELECT c.officer_id, p.name_en, p.name_bn,
      COUNT(*) AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.status = 'fulfilled') / GREATEST(COUNT(*),1), 2) AS fulfillment_pct
    FROM commitments c
    LEFT JOIN profiles p ON p.id = c.officer_id
    WHERE c.created_at >= _period_start AND c.created_at < _period_end + interval '1 day'
    GROUP BY c.officer_id, p.name_en, p.name_bn
    ORDER BY fulfillment_pct DESC
    LIMIT 5
  ) t;

  -- High risk officers
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _high_risk_officers
  FROM (
    SELECT officer_id, risk_score, risk_level, failure_rate, reschedule_rate
    FROM officer_metrics
    WHERE risk_score >= 40
    ORDER BY risk_score DESC
    LIMIT 5
  ) t;

  -- Combine
  _summary := _summary || jsonb_build_object(
    'top_officers', _top_officers,
    'high_risk_officers', _high_risk_officers,
    'period_start', _period_start,
    'period_end', _period_end
  );

  -- Insert report
  INSERT INTO executive_reports (report_type, period_start, period_end, report_data)
  VALUES ('weekly_commitment_summary', _period_start, _period_end, _summary);

  RETURN jsonb_build_object('success', true, 'summary', _summary);
END;
$$;

-- 5. Storage bucket for monthly exports
INSERT INTO storage.buckets (id, name, public) VALUES ('commitment-exports', 'commitment-exports', false);

CREATE POLICY "Admin/owner access commitment-exports"
  ON storage.objects AS RESTRICTIVE FOR ALL
  USING (bucket_id = 'commitment-exports' AND is_admin_or_owner())
  WITH CHECK (bucket_id = 'commitment-exports' AND is_admin_or_owner());
