
-- ═══════════════════════════════════════════════
-- DECISION ENGINE v2.4 — Complete Atomic
-- ═══════════════════════════════════════════════

-- 1️⃣ Table
CREATE TABLE IF NOT EXISTS public.ai_decision_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid REFERENCES public.system_dna(id) ON DELETE CASCADE,
    priority_score integer NOT NULL DEFAULT 0,
    action_required text NOT NULL DEFAULT 'NORMAL MONITOR',
    insight_count integer NOT NULL DEFAULT 0,
    score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at timestamptz NOT NULL DEFAULT now(),
    run_id text,
    UNIQUE(entity_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_scores_priority ON public.ai_decision_scores(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_decision_scores_action ON public.ai_decision_scores(action_required);

ALTER TABLE public.ai_decision_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='admin_owner_read_decision_scores') THEN
        CREATE POLICY "admin_owner_read_decision_scores" ON public.ai_decision_scores FOR SELECT TO authenticated USING (is_admin_or_owner());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='block_anon_decision_scores') THEN
        CREATE POLICY "block_anon_decision_scores" ON public.ai_decision_scores FOR SELECT TO anon USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='block_user_insert_decision_scores') THEN
        CREATE POLICY "block_user_insert_decision_scores" ON public.ai_decision_scores FOR INSERT TO authenticated WITH CHECK (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='block_user_update_decision_scores') THEN
        CREATE POLICY "block_user_update_decision_scores" ON public.ai_decision_scores FOR UPDATE TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='block_user_delete_decision_scores') THEN
        CREATE POLICY "block_user_delete_decision_scores" ON public.ai_decision_scores FOR DELETE TO authenticated USING (false);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ai_decision_scores' AND policyname='service_role_all_decision_scores') THEN
        CREATE POLICY "service_role_all_decision_scores" ON public.ai_decision_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END;
$$;

-- 2️⃣ Decision Engine Function
CREATE OR REPLACE FUNCTION public.fn_decision_engine(p_run_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
    v_start timestamptz := clock_timestamp();
    v_scored integer; v_immediate integer; v_high integer; v_normal integer; v_duration_ms integer;
BEGIN
    PERFORM pg_advisory_xact_lock(987654322);

    WITH active_insights AS (
        SELECT entity_id, insight_type
        FROM public.ai_insights
        WHERE status = 'active' AND metadata->>'auto_generated' = 'true' AND entity_id IS NOT NULL
    ),
    entity_scores AS (
        SELECT entity_id, count(*) AS insight_count,
            SUM(CASE insight_type
                WHEN 'risk' THEN 5 WHEN 'circular_dependency' THEN 5
                WHEN 'dependency_warning' THEN 4 WHEN 'anomaly' THEN 3
                WHEN 'version_churn' THEN 2 ELSE 1
            END) AS total_score,
            jsonb_object_agg(insight_type, count_per_type) AS breakdown
        FROM (SELECT entity_id, insight_type, count(*) AS count_per_type FROM active_insights GROUP BY entity_id, insight_type) sub
        GROUP BY entity_id
    )
    INSERT INTO public.ai_decision_scores(entity_id, priority_score, action_required, insight_count, score_breakdown, computed_at, run_id)
    SELECT es.entity_id, es.total_score,
        CASE WHEN es.total_score >= 10 THEN 'IMMEDIATE REVIEW' WHEN es.total_score >= 6 THEN 'HIGH PRIORITY' ELSE 'NORMAL MONITOR' END,
        es.insight_count, es.breakdown, now(), p_run_id
    FROM entity_scores es
    ON CONFLICT (entity_id) DO UPDATE SET
        priority_score=EXCLUDED.priority_score, action_required=EXCLUDED.action_required,
        insight_count=EXCLUDED.insight_count, score_breakdown=EXCLUDED.score_breakdown,
        computed_at=EXCLUDED.computed_at, run_id=EXCLUDED.run_id;

    DELETE FROM public.ai_decision_scores WHERE entity_id NOT IN (
        SELECT DISTINCT entity_id FROM public.ai_insights
        WHERE status='active' AND metadata->>'auto_generated'='true' AND entity_id IS NOT NULL
    );

    SELECT count(*) INTO v_scored FROM public.ai_decision_scores;
    SELECT count(*) INTO v_immediate FROM public.ai_decision_scores WHERE action_required='IMMEDIATE REVIEW';
    SELECT count(*) INTO v_high FROM public.ai_decision_scores WHERE action_required='HIGH PRIORITY';
    v_normal := v_scored - v_immediate - v_high;
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp()-v_start))::integer * 1000;

    INSERT INTO public.ai_pipeline_metrics(metric_type,status,duration_ms,metadata)
    VALUES ('decision_engine','success',v_duration_ms,jsonb_build_object(
        'scored_entities',v_scored,'immediate_review',v_immediate,'high_priority',v_high,'normal_monitor',v_normal,'run_id',p_run_id));

    IF v_immediate > 0 THEN
        PERFORM public.insert_deduplicated_alert('warning',format('%s entities require IMMEDIATE REVIEW',v_immediate),'decision_engine_immediate',120);
    END IF;

    RETURN jsonb_build_object('scored',v_scored,'immediate_review',v_immediate,'high_priority',v_high,'normal_monitor',v_normal,'duration_ms',v_duration_ms);
END;
$$;

-- 3️⃣ Pipeline wrapper upgrade
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
    v_insights_result jsonb; v_decision_result jsonb;
    v_run_id text := gen_random_uuid()::text;
BEGIN
    PERFORM pg_advisory_xact_lock(987654321);
    v_insights_result := public.fn_generate_ai_insights_core();
    PERFORM public.assert_pipeline_idempotency();
    v_decision_result := public.fn_decision_engine(v_run_id);
    RETURN jsonb_build_object('run_id',v_run_id,'insights',v_insights_result,'decisions',v_decision_result);
EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.ai_pipeline_metrics(metric_type,status,metadata)
    VALUES ('pipeline_execution','failed',jsonb_build_object('error',SQLERRM,'sqlstate',SQLSTATE));
    RAISE;
END;
$$;

-- 4️⃣ Materialized View
DROP MATERIALIZED VIEW IF EXISTS public.ai_decision_scores_mat;
CREATE MATERIALIZED VIEW public.ai_decision_scores_mat AS
SELECT ds.entity_id, sd.entity_name, sd.category, sd.criticality_score,
    ds.priority_score, ds.action_required, ds.insight_count, ds.score_breakdown, ds.computed_at
FROM public.ai_decision_scores ds
JOIN public.system_dna sd ON sd.id = ds.entity_id
ORDER BY ds.priority_score DESC
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_decision_mat_entity ON public.ai_decision_scores_mat(entity_id);

-- 5️⃣ Safe refresh update
CREATE OR REPLACE FUNCTION public.refresh_ai_views_safe()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
    EXCEPTION WHEN OTHERS THEN INSERT INTO public.ai_pipeline_metrics(metric_type,status,metadata) VALUES ('ai_system_health_refresh','failed',jsonb_build_object('error',SQLERRM)); END;
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_dashboard_metrics_mat;
    EXCEPTION WHEN OTHERS THEN INSERT INTO public.ai_pipeline_metrics(metric_type,status,metadata) VALUES ('ai_dashboard_refresh','failed',jsonb_build_object('error',SQLERRM)); END;
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_decision_scores_mat;
    EXCEPTION WHEN OTHERS THEN INSERT INTO public.ai_pipeline_metrics(metric_type,status,metadata) VALUES ('ai_decision_scores_refresh','failed',jsonb_build_object('error',SQLERRM)); END;
END;
$$;

-- 6️⃣ Version
INSERT INTO public.ai_pipeline_versions(version,deployed_by,changes_summary)
VALUES ('v2.4.0','lovable-architect','Decision Engine: entity scoring (IMMEDIATE/HIGH/NORMAL), advisory lock, auto-alerts, mat-view, chained pipeline wrapper');
