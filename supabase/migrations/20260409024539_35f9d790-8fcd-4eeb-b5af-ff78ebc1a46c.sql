
-- ═══════════════════════════════════════════════════════════
-- AI Pipeline v2.2 — Hardened Static Definition
-- Drops dynamic DO-block injection, uses SET in function def
-- ═══════════════════════════════════════════════════════════

-- 1️⃣ Recreate fn_generate_ai_insights with static SET clauses
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
-- AI Pipeline v2.2 Hardened Static Definition
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
      UNION ALL
      SELECT d.source_entity_id, er.target_entity_id, d.path || er.source_entity_id
      FROM dep_graph d
      JOIN public.entity_relations er ON er.source_entity_id = d.target_entity_id
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

-- 2️⃣ Recreate simulate_pipeline_test with static SET and explicit dry-run call
CREATE OR REPLACE FUNCTION public.simulate_pipeline_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
-- AI Pipeline v2.2 Hardened Static Definition
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

    -- TEST 3: Insight generation callable (DRY-RUN ONLY — non-mutating)
    v_test_name := 'insight_generation_callable';
    BEGIN
        v_temp := public.fn_generate_ai_insights_dry_run();
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
    v_test_name := 'dedup_working';
    BEGIN
        PERFORM public.insert_deduplicated_alert('info', 'Self-test probe', 'selftest_probe', 5);
        SELECT public.insert_deduplicated_alert('info', 'Self-test probe duplicate', 'selftest_probe', 5) INTO v_temp_bool;
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

-- 3️⃣ Version log
INSERT INTO public.ai_pipeline_versions(version, changes_summary, deployed_by)
VALUES (
  'v2.2.0',
  'Hardened static definitions: removed DO-block dynamic injection, SET lock_timeout/statement_timeout in function signature, explicit dry-run in simulate_pipeline_test',
  'architect'
);
