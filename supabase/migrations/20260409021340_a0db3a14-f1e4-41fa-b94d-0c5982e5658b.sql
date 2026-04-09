
-- ═══════════════════════════════════════════════════
-- GAP 1: Metrics & Observability Layer
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_pipeline_metrics (
    id bigserial PRIMARY KEY,
    run_id bigint,
    metric_type text NOT NULL DEFAULT 'pipeline_run',
    duration_ms integer,
    insights_generated integer DEFAULT 0,
    alerts_generated integer DEFAULT 0,
    status text,
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON public.ai_pipeline_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_type_time ON public.ai_pipeline_metrics(metric_type, recorded_at DESC);

ALTER TABLE public.ai_pipeline_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_pipeline_metrics"
ON public.ai_pipeline_metrics FOR SELECT TO authenticated
USING (is_admin_or_owner());

CREATE POLICY "block_anon_pipeline_metrics"
ON public.ai_pipeline_metrics FOR SELECT TO anon
USING (false);

CREATE POLICY "service_role_all_pipeline_metrics"
ON public.ai_pipeline_metrics FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "block_user_insert_pipeline_metrics"
ON public.ai_pipeline_metrics FOR INSERT TO authenticated
WITH CHECK (false);

CREATE POLICY "block_user_update_pipeline_metrics"
ON public.ai_pipeline_metrics FOR UPDATE TO authenticated
USING (false);

CREATE POLICY "block_user_delete_pipeline_metrics"
ON public.ai_pipeline_metrics FOR DELETE TO authenticated
USING (false);

-- Trend view: hourly aggregation for last 24h
CREATE OR REPLACE VIEW public.ai_pipeline_trend_24h AS
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

-- ═══════════════════════════════════════════════════
-- GAP 2: Alert Deduplication
-- ═══════════════════════════════════════════════════

ALTER TABLE public.ai_pipeline_alerts
ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint_time
ON public.ai_pipeline_alerts(fingerprint, alert_time DESC);

-- Helper: deduplicated alert insert
CREATE OR REPLACE FUNCTION public.insert_deduplicated_alert(
    p_severity text,
    p_message text,
    p_fingerprint text,
    p_window_minutes integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    already_exists boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.ai_pipeline_alerts
        WHERE fingerprint = p_fingerprint
          AND alert_time > now() - make_interval(mins => p_window_minutes)
    ) INTO already_exists;

    IF already_exists THEN
        RETURN false;
    END IF;

    INSERT INTO public.ai_pipeline_alerts(severity, message, fingerprint)
    VALUES (p_severity, p_message, p_fingerprint);

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_deduplicated_alert(text, text, text, integer) TO service_role;

-- ═══════════════════════════════════════════════════
-- Updated check_ai_pipeline_health() with dedup + metrics
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_ai_pipeline_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    last_run record;
    config_row record;
    stale_interval interval;
    result jsonb;
    v_start timestamptz := clock_timestamp();
    v_alerts_count integer := 0;
    v_inserted boolean;
BEGIN
    SELECT * INTO config_row FROM public.ai_pipeline_config LIMIT 1;
    stale_interval := make_interval(mins => COALESCE(config_row.max_stale_minutes, 120));

    SELECT * INTO last_run
    FROM public.ai_pipeline_runs
    ORDER BY run_at DESC
    LIMIT 1;

    IF last_run IS NULL THEN
        SELECT public.insert_deduplicated_alert('critical', 'No pipeline runs found', 'health_no_runs', COALESCE(config_row.max_stale_minutes, 120)) INTO v_inserted;
        IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;
        result := jsonb_build_object(
            'healthy', false,
            'reason', 'No pipeline runs found',
            'last_run_at', null,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    ELSIF last_run.status != 'completed' THEN
        SELECT public.insert_deduplicated_alert('warning', format('Last AI pipeline run failed or incomplete: %s', last_run.remarks), 'health_run_failed', COALESCE(config_row.max_stale_minutes, 120)) INTO v_inserted;
        IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last run status: %s - %s', last_run.status, last_run.remarks),
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    ELSIF last_run.run_at < now() - stale_interval THEN
        SELECT public.insert_deduplicated_alert('warning', format('Last successful run was over %s minutes ago', COALESCE(config_row.max_stale_minutes, 120)), 'health_stale_run', COALESCE(config_row.max_stale_minutes, 120)) INTO v_inserted;
        IF v_inserted THEN v_alerts_count := v_alerts_count + 1; END IF;
        result := jsonb_build_object(
            'healthy', false,
            'reason', format('Last successful run was over %s minutes ago', COALESCE(config_row.max_stale_minutes, 120)),
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    ELSE
        result := jsonb_build_object(
            'healthy', true,
            'reason', 'Pipeline running normally',
            'last_run_at', last_run.run_at,
            'config', jsonb_build_object('max_stale_minutes', COALESCE(config_row.max_stale_minutes, 120))
        );
    END IF;

    -- Auto-escalate if enabled
    IF config_row IS NOT NULL AND config_row.alert_escalation_enabled THEN
        PERFORM public.escalate_critical_alerts();
    END IF;

    -- Record health check metric
    INSERT INTO public.ai_pipeline_metrics(metric_type, duration_ms, alerts_generated, status)
    VALUES ('health_check', extract(milliseconds from clock_timestamp() - v_start)::integer, v_alerts_count,
            CASE WHEN (result->>'healthy')::boolean THEN 'success' ELSE 'unhealthy' END);

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_pipeline_health() TO service_role;

-- ═══════════════════════════════════════════════════
-- Updated fn_generate_ai_insights() with config-driven cap + metrics
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_high_crit int := 0;
  v_dep_warning int := 0;
  v_anomaly int := 0;
  v_circular int := 0;
  v_rec record;
  v_one_hour_ago timestamptz := now() - interval '1 hour';
  v_start timestamptz := clock_timestamp();
  v_max_insights int;
  v_config record;
BEGIN
  -- Load config
  SELECT * INTO v_config FROM public.ai_pipeline_config LIMIT 1;
  v_max_insights := COALESCE(v_config.max_active_insights, 200);

  -- Auto-resolve stale insights (>30 days)
  UPDATE public.ai_insights
  SET status = 'resolved'
  WHERE status = 'active'
    AND metadata->>'auto_generated' = 'true'
    AND is_locked = false
    AND created_at < now() - interval '30 days';

  -- Cap active insights (config-driven)
  WITH excess AS (
    SELECT id FROM public.ai_insights
    WHERE status = 'active'
    ORDER BY created_at ASC
    OFFSET v_max_insights
  )
  UPDATE public.ai_insights SET status = 'resolved'
  WHERE id IN (SELECT id FROM excess);

  -- 1) High criticality entities
  FOR v_rec IN
    SELECT id, entity_name, criticality_score
    FROM public.system_dna
    WHERE criticality_score >= 4 AND is_active = true
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'risk',
      'High criticality: ' || v_rec.entity_name,
      'Entity ' || v_rec.entity_name || ' has criticality score ' || v_rec.criticality_score,
      CASE WHEN v_rec.criticality_score >= 5 THEN 5 ELSE 4 END,
      jsonb_build_object('auto_generated','true','criticality',v_rec.criticality_score)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_high_crit := v_high_crit + 1; END IF;
  END LOOP;

  -- 2) Entities with >5 dependencies
  FOR v_rec IN
    SELECT sd.id, sd.entity_name, count(*) AS dep_count
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.source_entity_id = sd.id OR er.target_entity_id = sd.id
    WHERE sd.is_active = true
    GROUP BY sd.id, sd.entity_name
    HAVING count(*) > 5
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'dependency_warning',
      'High dependency count: ' || v_rec.entity_name,
      v_rec.entity_name || ' has ' || v_rec.dep_count || ' dependencies',
      4,
      jsonb_build_object('auto_generated','true','dep_count',v_rec.dep_count)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_dep_warning := v_dep_warning + 1; END IF;
  END LOOP;

  -- 3) Circular dependency detection
  FOR v_rec IN
    WITH RECURSIVE dep_graph AS (
      SELECT er.source_entity_id, er.target_entity_id, ARRAY[er.source_entity_id] AS path
      FROM public.entity_relations er
      JOIN public.system_dna sd ON sd.id = er.source_entity_id AND sd.is_active = true
      UNION ALL
      SELECT d.source_entity_id, er.target_entity_id, d.path || er.target_entity_id
      FROM dep_graph d
      JOIN public.entity_relations er ON d.target_entity_id = er.source_entity_id
      WHERE NOT er.target_entity_id = ANY(d.path)
        AND array_length(d.path, 1) < 10
    )
    SELECT DISTINCT dg.source_entity_id AS id, sd.entity_name
    FROM dep_graph dg
    JOIN public.system_dna sd ON sd.id = dg.source_entity_id
    WHERE dg.target_entity_id = dg.source_entity_id
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'dependency_warning',
      'Circular dependency: ' || v_rec.entity_name,
      v_rec.entity_name || ' is part of a circular dependency chain',
      5,
      jsonb_build_object('auto_generated','true','circular',true)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_circular := v_circular + 1; END IF;
  END LOOP;

  -- 4) High version churn (>2 changes in last 7 days)
  FOR v_rec IN
    SELECT sd.id, sd.entity_name, rv.changes_last_7d
    FROM public.system_dna sd
    JOIN (
      SELECT dna_id, count(*) AS changes_last_7d
      FROM public.system_dna_history
      WHERE changed_at > now() - interval '7 days'
      GROUP BY dna_id
      HAVING count(*) > 2
    ) rv ON rv.dna_id = sd.id
    WHERE sd.is_active = true
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'anomaly',
      'High version churn: ' || v_rec.entity_name,
      v_rec.entity_name || ' changed ' || v_rec.changes_last_7d || ' times in 7 days',
      3,
      jsonb_build_object('auto_generated','true','changes_7d',v_rec.changes_last_7d)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_anomaly := v_anomaly + 1; END IF;
  END LOOP;

  -- Refresh materialized view
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.ai_system_health_mat;
  END;

  -- Record pipeline run metrics
  INSERT INTO public.ai_pipeline_metrics(
    metric_type, duration_ms, insights_generated, alerts_generated, status, metadata
  ) VALUES (
    'pipeline_run',
    extract(milliseconds from clock_timestamp() - v_start)::integer,
    v_high_crit + v_dep_warning + v_anomaly + v_circular,
    0,
    'success',
    jsonb_build_object(
      'high_crit', v_high_crit,
      'dep_warning', v_dep_warning,
      'circular', v_circular,
      'anomalies', v_anomaly,
      'max_insights_cap', v_max_insights
    )
  );

  RETURN jsonb_build_object(
    'total_insights_created', v_high_crit + v_dep_warning + v_anomaly + v_circular,
    'high_criticality', v_high_crit,
    'dependency_warnings', v_dep_warning,
    'circular_dependencies', v_circular,
    'anomalies', v_anomaly,
    'duration_ms', extract(milliseconds from clock_timestamp() - v_start)::integer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_generate_ai_insights() TO service_role;

-- ═══════════════════════════════════════════════════
-- GAP 3: Monthly Self-Test (Disaster Simulation)
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.simulate_pipeline_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start timestamptz := clock_timestamp();
    v_results jsonb := '[]'::jsonb;
    v_pass int := 0;
    v_fail int := 0;
    v_test_name text;
    v_test_result jsonb;
    v_temp jsonb;
    v_temp_bool boolean;
    v_cron_check jsonb;
    v_mat_populated boolean;
BEGIN
    -- TEST 1: Config table readable
    v_test_name := 'config_readable';
    BEGIN
        PERFORM 1 FROM public.ai_pipeline_config LIMIT 1;
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', true);
        v_pass := v_pass + 1;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 2: Health check callable
    v_test_name := 'health_check_callable';
    BEGIN
        v_temp := public.check_ai_pipeline_health();
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', true, 'result', v_temp);
        v_pass := v_pass + 1;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 3: Insight generation callable
    v_test_name := 'insight_generation_callable';
    BEGIN
        v_temp := public.fn_generate_ai_insights();
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', true, 'result', v_temp);
        v_pass := v_pass + 1;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 4: Required cron jobs present
    v_test_name := 'cron_jobs_present';
    BEGIN
        v_cron_check := public.verify_required_cron_jobs();
        v_temp_bool := (v_cron_check->>'status') = 'all_present';
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', v_temp_bool, 'result', v_cron_check);
        IF v_temp_bool THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 5: Materialized views populated
    v_test_name := 'matviews_populated';
    BEGIN
        SELECT ispopulated INTO v_mat_populated
        FROM pg_matviews
        WHERE schemaname = 'public' AND matviewname = 'ai_system_health_mat';
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', COALESCE(v_mat_populated, false));
        IF COALESCE(v_mat_populated, false) THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 6: Deduplication working
    v_test_name := 'alert_dedup_working';
    BEGIN
        -- Insert a test alert, then try duplicate
        PERFORM public.insert_deduplicated_alert('info', 'Self-test probe', 'selftest_probe', 5);
        SELECT public.insert_deduplicated_alert('info', 'Self-test probe duplicate', 'selftest_probe', 5) INTO v_temp_bool;
        -- Second insert should return false (deduplicated)
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', NOT v_temp_bool);
        IF NOT v_temp_bool THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- TEST 7: Metrics table writable
    v_test_name := 'metrics_writable';
    BEGIN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('self_test', 'probe', '{"test": true}'::jsonb);
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', true);
        v_pass := v_pass + 1;
    EXCEPTION WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('test', v_test_name, 'pass', false, 'error', SQLERRM);
        v_fail := v_fail + 1;
    END;

    -- Log overall result as alert
    IF v_fail > 0 THEN
        PERFORM public.insert_deduplicated_alert(
            'warning',
            format('Monthly self-test: %s/%s passed, %s failed', v_pass, v_pass + v_fail, v_fail),
            'selftest_monthly_result',
            1440
        );
    END IF;

    -- Record self-test metrics
    INSERT INTO public.ai_pipeline_metrics(
        metric_type, duration_ms, status, metadata
    ) VALUES (
        'self_test',
        extract(milliseconds from clock_timestamp() - v_start)::integer,
        CASE WHEN v_fail = 0 THEN 'success' ELSE 'partial_failure' END,
        jsonb_build_object('passed', v_pass, 'failed', v_fail, 'tests', v_results)
    );

    -- Version log
    INSERT INTO public.ai_pipeline_versions(version, changes_summary, deployed_by)
    VALUES ('self-test-' || to_char(now(), 'YYYYMMDD'), format('Self-test: %s/%s passed', v_pass, v_pass + v_fail), 'auto-test')
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_fail = 0 THEN 'ALL_PASS' ELSE 'PARTIAL_FAILURE' END,
        'passed', v_pass,
        'failed', v_fail,
        'total_tests', v_pass + v_fail,
        'duration_ms', extract(milliseconds from clock_timestamp() - v_start)::integer,
        'tests', v_results,
        'tested_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulate_pipeline_test() TO service_role;
GRANT EXECUTE ON FUNCTION public.simulate_pipeline_test() TO authenticated;
