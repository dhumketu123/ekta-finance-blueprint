
-- ═══════════════════════════════════════════════
-- MASTER STABILITY PATCH v2.3
-- Atomic Guard + Idempotency + Failure Isolation
-- ═══════════════════════════════════════════════

-- 4️⃣ MUST RUN FIRST: Rename existing function to _core before overwriting
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'fn_generate_ai_insights'
        AND pronamespace = 'public'::regnamespace
    )
    AND NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'fn_generate_ai_insights_core'
        AND pronamespace = 'public'::regnamespace
    )
    THEN
        ALTER FUNCTION public.fn_generate_ai_insights()
        RENAME TO fn_generate_ai_insights_core;
    END IF;
END;
$$;

-- 1️⃣ Strong Unique Constraint (Auto Insights Dedup Guard)
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_insights_auto_active
ON public.ai_insights(entity_id, insight_type)
WHERE metadata->>'auto_generated' = 'true'
AND status = 'active'
AND is_locked = false;

-- 2️⃣ Idempotency Assertion Function
CREATE OR REPLACE FUNCTION public.assert_pipeline_idempotency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dup_count int;
BEGIN
    SELECT count(*) INTO v_dup_count
    FROM (
        SELECT entity_id, insight_type
        FROM public.ai_insights
        WHERE metadata->>'auto_generated' = 'true'
        AND status = 'active'
        GROUP BY entity_id, insight_type
        HAVING count(*) > 1
    ) t;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION 'Idempotency violation detected: % duplicate groups', v_dup_count;
    END IF;
END;
$$;

-- 3️⃣ Advisory Lock + Timeout Safe Wrapper
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
-- AI Pipeline v2.3 — Master Stability Patch
DECLARE
    v_result jsonb;
BEGIN
    -- Concurrency Guard: only one execution at a time
    PERFORM pg_advisory_xact_lock(987654321);

    -- Execute core logic
    v_result := public.fn_generate_ai_insights_core();

    -- Post-execution idempotency check
    PERFORM public.assert_pipeline_idempotency();

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
    VALUES (
        'pipeline_execution',
        'failed',
        jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)
    );
    RAISE;
END;
$$;

-- 5️⃣ Safe Materialized View Refresh Function
CREATE OR REPLACE FUNCTION public.refresh_ai_views_safe()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('ai_system_health_refresh', 'failed', jsonb_build_object('error', SQLERRM));
    END;

    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_dashboard_metrics_mat;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.ai_pipeline_metrics(metric_type, status, metadata)
        VALUES ('ai_dashboard_refresh', 'failed', jsonb_build_object('error', SQLERRM));
    END;
END;
$$;

-- 6️⃣ Version Log
INSERT INTO public.ai_pipeline_versions(version, deployed_by, changes_summary)
VALUES (
    'v2.3.0',
    'lovable-architect',
    'Master Stability Patch: Advisory lock concurrency guard, idempotency assertion, unique partial index on auto-insights, safe mat-view refresh with failure isolation'
);
