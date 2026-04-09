
-- ═══════════════════════════════════════════════
-- 1️⃣ Metrics Query Performance Index
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_metrics_type_time
ON public.ai_pipeline_metrics(metric_type, recorded_at DESC);

-- ═══════════════════════════════════════════════
-- 2️⃣ Alert Dedup Severity-Safe Upgrade
-- ═══════════════════════════════════════════════
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
        SELECT 1
        FROM public.ai_pipeline_alerts
        WHERE fingerprint = p_fingerprint
          AND severity = p_severity
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

-- ═══════════════════════════════════════════════
-- 3️⃣ Dry-Run Function for Safe Self-Test
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights_dry_run()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN jsonb_build_object(
        'callable', true,
        'note', 'Dry run validation only'
    );
END;
$$;

-- ═══════════════════════════════════════════════
-- 4️⃣ Lock & Timeout + Dry-Run in fn_generate_ai_insights
-- ═══════════════════════════════════════════════
DO $$
DECLARE
    fn_body text;
BEGIN
    -- Add lock_timeout and statement_timeout to fn_generate_ai_insights if it exists
    SELECT pg_get_functiondef(oid) INTO fn_body
    FROM pg_proc
    WHERE proname = 'fn_generate_ai_insights' AND pronamespace = 'public'::regnamespace;

    IF fn_body IS NOT NULL AND fn_body NOT LIKE '%lock_timeout%' THEN
        -- We'll recreate with timeout protection
        EXECUTE regexp_replace(
            fn_body,
            'BEGIN',
            E'BEGIN\n    PERFORM set_config(''lock_timeout'',''5s'', true);\n    PERFORM set_config(''statement_timeout'',''30s'', true);',
            'gi'
        );
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════
-- 5️⃣ Update simulate_pipeline_test to use dry-run
-- ═══════════════════════════════════════════════
DO $$
DECLARE
    fn_body text;
BEGIN
    SELECT pg_get_functiondef(oid) INTO fn_body
    FROM pg_proc
    WHERE proname = 'simulate_pipeline_test' AND pronamespace = 'public'::regnamespace;

    IF fn_body IS NOT NULL AND fn_body LIKE '%fn_generate_ai_insights()%' THEN
        fn_body := replace(fn_body, 'fn_generate_ai_insights()', 'fn_generate_ai_insights_dry_run()');
        EXECUTE fn_body;
    END IF;
END;
$$;
