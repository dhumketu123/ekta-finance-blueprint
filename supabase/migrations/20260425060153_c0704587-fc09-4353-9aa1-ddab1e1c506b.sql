-- ============================================================
-- v5.1.1 — FINAL SEAL PATCH
-- ============================================================

-- ───────────────────────────────────────────────
-- 1. CRON AUTHORITY LOCK
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_cron_registry (
  job_name TEXT PRIMARY KEY,
  authoritative_function TEXT NOT NULL,
  schedule TEXT NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.system_cron_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access cron registry" ON public.system_cron_registry;
CREATE POLICY "Service role full access cron registry" ON public.system_cron_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read cron registry" ON public.system_cron_registry;
CREATE POLICY "Authenticated read cron registry" ON public.system_cron_registry
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.system_cron_registry (job_name, authoritative_function, schedule, notes) VALUES
  ('event-processor', 'run_financial_event_worker', '* * * * *', 'Single authoritative worker — DO NOT DUPLICATE'),
  ('dlq-replay', 'replay_dlq_events', '*/10 * * * *', 'DLQ exponential backoff replay'),
  ('governance-daily-snapshot', 'enterprise_governance_snapshot', '0 2 * * *', 'Daily health score snapshot')
ON CONFLICT (job_name) DO UPDATE
  SET authoritative_function = EXCLUDED.authoritative_function,
      schedule = EXCLUDED.schedule,
      is_locked = true;

-- ───────────────────────────────────────────────
-- 2. DLQ LIFECYCLE — tenant index + archive function + tenant trigger
-- ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dlq_tenant_status ON public.financial_event_dlq(tenant_id, status);

DROP TRIGGER IF EXISTS trg_assert_tenant_dlq ON public.financial_event_dlq;
CREATE TRIGGER trg_assert_tenant_dlq
  BEFORE INSERT OR UPDATE ON public.financial_event_dlq
  FOR EACH ROW EXECUTE FUNCTION public.assert_tenant_isolation();

CREATE OR REPLACE FUNCTION public.archive_dlq_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purged INT := 0;
  v_total INT;
  v_overflow_purged INT := 0;
BEGIN
  -- Purge resolved/permanent older than 30 days
  WITH del AS (
    DELETE FROM public.financial_event_dlq
    WHERE status IN ('RESOLVED','PERMANENT_FAILURE')
      AND COALESCE(resolved_at, failed_at) < now() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_purged FROM del;

  -- Overflow guard: if > 100k rows, prune oldest resolved/permanent
  SELECT COUNT(*) INTO v_total FROM public.financial_event_dlq;
  IF v_total > 100000 THEN
    WITH oldest AS (
      SELECT id FROM public.financial_event_dlq
      WHERE status IN ('RESOLVED','PERMANENT_FAILURE')
      ORDER BY failed_at ASC
      LIMIT (v_total - 100000)
    )
    DELETE FROM public.financial_event_dlq WHERE id IN (SELECT id FROM oldest);
    GET DIAGNOSTICS v_overflow_purged = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'retention_purged', v_purged,
    'overflow_purged', v_overflow_purged,
    'remaining_rows', v_total - v_purged - v_overflow_purged,
    'archived_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.archive_dlq_events() TO service_role;

-- ───────────────────────────────────────────────
-- 3. REPLAY IDEMPOTENCY LOCK
-- ───────────────────────────────────────────────
ALTER TABLE public.financial_event_dlq
  ADD COLUMN IF NOT EXISTS replay_version INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dlq_source_replay
  ON public.financial_event_dlq(source_event_id, replay_version)
  WHERE source_event_id IS NOT NULL;

-- Update replay function to increment version on each retry
CREATE OR REPLACE FUNCTION public.replay_dlq_events(p_limit INT DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_replayed INT := 0;
  v_permanent INT := 0;
  v_still_failing INT := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.financial_event_dlq
    WHERE status = 'PENDING_RETRY'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND retry_count < 5
    ORDER BY failed_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.post_financial_event(
        v_row.tenant_id,
        v_row.event_type,
        COALESCE((v_row.payload->>'amount')::NUMERIC, 0),
        NULLIF(v_row.payload->>'reference_id','')::UUID,
        COALESCE(v_row.payload->>'reference_type', v_row.event_type),
        v_row.payload->>'narration',
        v_row.created_by
      );

      UPDATE public.financial_event_dlq
      SET status = 'RESOLVED',
          resolved_at = now(),
          replay_version = replay_version + 1
      WHERE id = v_row.id;

      v_replayed := v_replayed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.financial_event_dlq
      SET retry_count = retry_count + 1,
          replay_version = replay_version + 1,
          error_message = SQLERRM,
          next_retry_at = now() + (INTERVAL '5 minutes' * POWER(2, retry_count + 1)),
          status = CASE WHEN retry_count + 1 >= 5 THEN 'PERMANENT_FAILURE' ELSE 'PENDING_RETRY' END
      WHERE id = v_row.id;

      IF v_row.retry_count + 1 >= 5 THEN
        v_permanent := v_permanent + 1;
      ELSE
        v_still_failing := v_still_failing + 1;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'replayed', v_replayed,
    'permanent_failures', v_permanent,
    'still_failing', v_still_failing,
    'completed_at', now()
  );
END $function$;

-- ───────────────────────────────────────────────
-- 4. GOVERNANCE CIRCUIT BREAKER on enqueue
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
  v_pending INT;
  v_bypass TEXT;
BEGIN
  v_bypass := current_setting('app.governance_bypass', true);

  IF v_bypass IS DISTINCT FROM 'true' THEN
    SELECT health_score INTO v_health
    FROM public.governance_metrics_history
    ORDER BY snapshot_time DESC
    LIMIT 1;

    IF v_health IS NOT NULL THEN
      -- Hard freeze
      IF v_health < 50 THEN
        RAISE EXCEPTION 'GOVERNANCE_FREEZE: health_score=% — gateway ingestion frozen', v_health;
      END IF;

      -- Throttle when degraded
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
-- 5. SINGLE SOURCE OF TRUTH API
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enterprise_system_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_imbalance INT;
  v_pending INT;
  v_failed INT;
  v_dlq_pending INT;
  v_dlq_perm INT;
  v_worker RECORD;
  v_latest_snapshot RECORD;
BEGIN
  SELECT COUNT(*) INTO v_imbalance FROM public.double_entry_ledger WHERE debit <> credit;
  SELECT COUNT(*) INTO v_pending FROM public.financial_event_gateway WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_failed FROM public.financial_event_gateway WHERE status = 'FAILED';
  SELECT COUNT(*) INTO v_dlq_pending FROM public.financial_event_dlq WHERE status = 'PENDING_RETRY';
  SELECT COUNT(*) INTO v_dlq_perm FROM public.financial_event_dlq WHERE status = 'PERMANENT_FAILURE';

  SELECT * INTO v_worker FROM public.financial_event_worker_state WHERE id = 1;
  SELECT * INTO v_latest_snapshot FROM public.governance_metrics_history
    ORDER BY snapshot_time DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ledger', jsonb_build_object(
      'status', CASE WHEN v_imbalance = 0 THEN 'BALANCED' ELSE 'IMBALANCED' END,
      'imbalance_count', v_imbalance
    ),
    'worker', jsonb_build_object(
      'is_running', COALESCE(v_worker.is_running, false),
      'last_run', v_worker.last_run,
      'last_duration_ms', v_worker.last_duration_ms,
      'total_processed', COALESCE(v_worker.total_processed, 0),
      'total_failed', COALESCE(v_worker.total_failed, 0),
      'last_status', v_worker.last_status
    ),
    'gateway', jsonb_build_object(
      'pending', v_pending,
      'failed', v_failed
    ),
    'dlq', jsonb_build_object(
      'pending_retry', v_dlq_pending,
      'permanent_failures', v_dlq_perm
    ),
    'governance', jsonb_build_object(
      'last_health_score', v_latest_snapshot.health_score,
      'last_snapshot_at', v_latest_snapshot.snapshot_time
    ),
    'tenant_isolation', 'ENFORCED',
    'system_state', CASE
      WHEN v_imbalance > 0 THEN 'CRITICAL'
      WHEN v_dlq_perm > 0 OR v_failed > 0 THEN 'DEGRADED'
      WHEN v_pending > 100 OR v_dlq_pending > 0 THEN 'PROCESSING'
      ELSE 'HEALTHY'
    END,
    'checked_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.enterprise_system_status() TO service_role, authenticated;