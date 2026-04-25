-- ============================================================
-- v5.1.2 — CRON HARD LOCK + FRESHNESS + ARCHIVER + SINGLE TRUTH
-- ============================================================

-- ───────────────────────────────────────────────
-- 1. CRON HARD LOCK (DB-level uniqueness)
-- ───────────────────────────────────────────────
ALTER TABLE public.system_cron_registry
  ADD CONSTRAINT uq_cron_job_function UNIQUE (job_name, authoritative_function);

CREATE OR REPLACE FUNCTION public.register_cron_job(
  p_job_name TEXT,
  p_function TEXT,
  p_schedule TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
BEGIN
  -- Hard-lock check: same job_name with different function = blocked
  SELECT * INTO v_existing FROM public.system_cron_registry WHERE job_name = p_job_name;
  IF FOUND AND v_existing.authoritative_function <> p_function AND v_existing.is_locked THEN
    RAISE EXCEPTION 'CRON_LOCK_VIOLATION: job % is locked to function %, refusing rebind to %',
      p_job_name, v_existing.authoritative_function, p_function;
  END IF;

  INSERT INTO public.system_cron_registry (job_name, authoritative_function, schedule)
  VALUES (p_job_name, p_function, p_schedule)
  ON CONFLICT (job_name) DO UPDATE
    SET schedule = EXCLUDED.schedule;

  RETURN jsonb_build_object('registered', p_job_name, 'function', p_function);
END $function$;

GRANT EXECUTE ON FUNCTION public.register_cron_job(TEXT,TEXT,TEXT) TO service_role;

-- ───────────────────────────────────────────────
-- 2. GOVERNANCE SNAPSHOT FRESHNESS LOCK
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_financial_event(
  p_tenant_id uuid,
  p_event_type text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_health INT;
  v_snap_time TIMESTAMPTZ;
  v_pending INT;
  v_bypass TEXT;
  v_live JSONB;
BEGIN
  v_bypass := current_setting('app.governance_bypass', true);

  IF v_bypass IS DISTINCT FROM 'true' THEN
    SELECT health_score, snapshot_time INTO v_health, v_snap_time
    FROM public.governance_metrics_history
    ORDER BY snapshot_time DESC
    LIMIT 1;

    -- Freshness lock: if no snapshot OR older than 2 minutes → recompute live
    IF v_snap_time IS NULL OR v_snap_time < now() - INTERVAL '2 minutes' THEN
      v_live := public.enterprise_governance_snapshot();
      v_health := (v_live->>'health_score')::INT;
    END IF;

    IF v_health IS NOT NULL THEN
      IF v_health < 50 THEN
        RAISE EXCEPTION 'GOVERNANCE_FREEZE: health_score=% — gateway ingestion frozen', v_health;
      END IF;
      IF v_health < 70 THEN
        SELECT COUNT(*) INTO v_pending FROM public.financial_event_gateway WHERE status = 'PENDING';
        IF v_pending > 200 THEN
          RAISE EXCEPTION 'GOVERNANCE_THROTTLE: health_score=% backlog=% — retry shortly', v_health, v_pending;
        END IF;
      END IF;
    END IF;
  END IF;

  PERFORM public.validate_event_payload(p_event_type, p_payload);

  INSERT INTO public.financial_event_gateway (tenant_id, event_type, payload, created_by)
  VALUES (p_tenant_id, p_event_type, COALESCE(p_payload, '{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

-- ───────────────────────────────────────────────
-- 4. SINGLE TRUTH ENFORCER — legacy delegates
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.financial_autonomy_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_status JSONB;
BEGIN
  -- DEPRECATED: delegates to enterprise_system_status() — the single source of truth.
  v_status := public.enterprise_system_status();
  RETURN jsonb_build_object(
    'pending_events', (v_status->'gateway'->>'pending')::INT,
    'failed_events', (v_status->'gateway'->>'failed')::INT,
    'worker_running', (v_status->'worker'->>'is_running')::BOOLEAN,
    'status', v_status->>'system_state',
    '_deprecated', true,
    '_canonical', 'enterprise_system_status',
    'checked_at', now()
  );
END $function$;

CREATE OR REPLACE FUNCTION public.system_final_audit_check()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status JSONB;
  v_orphan INT;
  v_backlog INT;
BEGIN
  -- DEPRECATED: delegates to enterprise_system_status() + adds audit-specific checks.
  v_status := public.enterprise_system_status();

  SELECT COUNT(*) INTO v_orphan
    FROM public.financial_event_gateway g
    WHERE g.status = 'PROCESSED'
      AND NOT EXISTS (
        SELECT 1 FROM public.double_entry_ledger l
        WHERE l.root_reference_id = g.id OR l.reference_id = g.id
      );

  SELECT COUNT(*) INTO v_backlog FROM public.financial_event_gateway
    WHERE status = 'PENDING' AND created_at < now() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'audit_passed', (v_status->'ledger'->>'imbalance_count')::INT = 0
                    AND v_backlog = 0
                    AND (v_status->'dlq'->>'permanent_failures')::INT = 0,
    'ledger_imbalance', (v_status->'ledger'->>'imbalance_count')::INT,
    'orphan_processed_events', v_orphan,
    'stale_backlog', v_backlog,
    'dlq_permanent_failures', (v_status->'dlq'->>'permanent_failures')::INT,
    '_deprecated', true,
    '_canonical', 'enterprise_system_status',
    'checked_at', now()
  );
END $function$;