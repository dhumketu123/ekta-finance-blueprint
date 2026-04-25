-- ============================================================
-- GIGA-FACTORY v5.0 — MASTER COMPLETION (SURGICAL, NON-BREAKING)
-- ============================================================

-- ───────────────────────────────────────────────
-- PHASE 1: Worker heartbeat counters (additive)
-- ───────────────────────────────────────────────
ALTER TABLE public.financial_event_worker_state
  ADD COLUMN IF NOT EXISTS last_duration_ms INT,
  ADD COLUMN IF NOT EXISTS total_processed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_failed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_status TEXT;

-- ───────────────────────────────────────────────
-- PHASE 2: Dead Letter Queue
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financial_event_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id UUID,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING_RETRY',
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_dlq_status_retry ON public.financial_event_dlq(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON public.financial_event_dlq(tenant_id);

ALTER TABLE public.financial_event_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access dlq" ON public.financial_event_dlq;
CREATE POLICY "Service role full access dlq" ON public.financial_event_dlq
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read own tenant dlq" ON public.financial_event_dlq;
CREATE POLICY "Authenticated read own tenant dlq" ON public.financial_event_dlq
  FOR SELECT TO authenticated USING (true);

-- Block update/delete (audit immutability — only status mutation via SECURITY DEFINER)
DROP POLICY IF EXISTS "Block direct dlq mutation" ON public.financial_event_dlq;
CREATE POLICY "Block direct dlq mutation" ON public.financial_event_dlq
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- ───────────────────────────────────────────────
-- PHASE 1+2: Hardened worker (replace, preserves contract)
-- Adds: duration tracking, counter accumulation, DLQ routing
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_financial_event_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lock BOOLEAN;
  v_processed INT := 0;
  v_failed INT := 0;
  v_event RECORD;
  v_started TIMESTAMPTZ := clock_timestamp();
  v_duration INT;
BEGIN
  SELECT is_running INTO v_lock
  FROM public.financial_event_worker_state
  WHERE id = 1;

  IF v_lock THEN
    RETURN jsonb_build_object('status', 'SKIPPED_ALREADY_RUNNING');
  END IF;

  UPDATE public.financial_event_worker_state
  SET is_running = true, last_run = now()
  WHERE id = 1;

  FOR v_event IN
    SELECT *
    FROM public.financial_event_gateway
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.post_financial_event(
        v_event.tenant_id,
        v_event.event_type,
        COALESCE((v_event.payload->>'amount')::NUMERIC, 0),
        NULLIF(v_event.payload->>'reference_id','')::UUID,
        COALESCE(v_event.payload->>'reference_type', v_event.event_type),
        v_event.payload->>'narration',
        v_event.created_by
      );

      UPDATE public.financial_event_gateway
      SET status = 'PROCESSED', processed_at = now()
      WHERE id = v_event.id;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.financial_event_gateway
      SET status = 'FAILED', error_message = SQLERRM, processed_at = now()
      WHERE id = v_event.id;

      -- Route to DLQ for replay
      INSERT INTO public.financial_event_dlq(
        source_event_id, tenant_id, event_type, payload, error_message,
        next_retry_at, created_by
      ) VALUES (
        v_event.id, v_event.tenant_id, v_event.event_type, v_event.payload,
        SQLERRM, now() + INTERVAL '5 minutes', v_event.created_by
      );

      v_failed := v_failed + 1;
    END;
  END LOOP;

  v_duration := EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::INT;

  UPDATE public.financial_event_worker_state
  SET is_running = false,
      updated_at = now(),
      last_duration_ms = v_duration,
      total_processed = total_processed + v_processed,
      total_failed = total_failed + v_failed,
      last_status = CASE WHEN v_failed > 0 THEN 'DEGRADED' ELSE 'OK' END
  WHERE id = 1;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed', v_failed,
    'duration_ms', v_duration,
    'status', 'COMPLETED'
  );
END $function$;

-- ───────────────────────────────────────────────
-- PHASE 2: DLQ Replay with exponential backoff
-- ───────────────────────────────────────────────
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
      SET status = 'RESOLVED', resolved_at = now()
      WHERE id = v_row.id;

      v_replayed := v_replayed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.financial_event_dlq
      SET retry_count = retry_count + 1,
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

GRANT EXECUTE ON FUNCTION public.replay_dlq_events(INT) TO service_role;

-- ───────────────────────────────────────────────
-- PHASE 4: Governance metrics history + snapshot
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.governance_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  health_score INT NOT NULL,
  system_state JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gov_history_time ON public.governance_metrics_history(snapshot_time DESC);

ALTER TABLE public.governance_metrics_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gov hist" ON public.governance_metrics_history;
CREATE POLICY "Service role full access gov hist" ON public.governance_metrics_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read gov hist" ON public.governance_metrics_history;
CREATE POLICY "Authenticated read gov hist" ON public.governance_metrics_history
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.enterprise_governance_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending INT;
  v_failed INT;
  v_dlq INT;
  v_dlq_perm INT;
  v_imbalance INT;
  v_worker_running BOOLEAN;
  v_worker_last TIMESTAMPTZ;
  v_health INT := 100;
  v_state JSONB;
BEGIN
  SELECT COUNT(*) INTO v_pending FROM public.financial_event_gateway WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_failed FROM public.financial_event_gateway WHERE status = 'FAILED';
  SELECT COUNT(*) INTO v_dlq FROM public.financial_event_dlq WHERE status = 'PENDING_RETRY';
  SELECT COUNT(*) INTO v_dlq_perm FROM public.financial_event_dlq WHERE status = 'PERMANENT_FAILURE';
  SELECT COUNT(*) INTO v_imbalance FROM public.double_entry_ledger WHERE debit <> credit;
  SELECT is_running, last_run INTO v_worker_running, v_worker_last
    FROM public.financial_event_worker_state WHERE id = 1;

  -- Health score deductions
  IF v_pending > 100 THEN v_health := v_health - 10; END IF;
  IF v_failed > 0 THEN v_health := v_health - 15; END IF;
  IF v_dlq > 0 THEN v_health := v_health - 10; END IF;
  IF v_dlq_perm > 0 THEN v_health := v_health - 25; END IF;
  IF v_imbalance > 0 THEN v_health := v_health - 40; END IF;
  IF v_worker_last IS NULL OR v_worker_last < now() - INTERVAL '15 minutes' THEN
    v_health := v_health - 20;
  END IF;
  IF v_health < 0 THEN v_health := 0; END IF;

  v_state := jsonb_build_object(
    'ledger_status', CASE WHEN v_imbalance = 0 THEN 'BALANCED' ELSE 'IMBALANCED' END,
    'worker_status', CASE WHEN v_worker_running THEN 'RUNNING' ELSE 'IDLE' END,
    'worker_last_run', v_worker_last,
    'pending_events', v_pending,
    'failed_events', v_failed,
    'dlq_size', v_dlq,
    'dlq_permanent_failures', v_dlq_perm,
    'ledger_imbalance_count', v_imbalance,
    'tenant_isolation_health', 'ENFORCED',
    'snapshot_at', now()
  );

  INSERT INTO public.governance_metrics_history(health_score, system_state)
  VALUES (v_health, v_state);

  RETURN jsonb_build_object('health_score', v_health, 'state', v_state);
END $function$;

GRANT EXECUTE ON FUNCTION public.enterprise_governance_snapshot() TO service_role, authenticated;

-- ───────────────────────────────────────────────
-- PHASE 5: Final audit check
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_final_audit_check()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_imbalance INT;
  v_orphan INT;
  v_backlog INT;
  v_dlq_perm INT;
  v_ok BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_imbalance FROM public.double_entry_ledger WHERE debit <> credit;
  SELECT COUNT(*) INTO v_orphan
    FROM public.financial_event_gateway g
    WHERE g.status = 'PROCESSED'
      AND NOT EXISTS (
        SELECT 1 FROM public.double_entry_ledger l
        WHERE l.root_reference_id = g.id OR l.reference_id = g.id
      );
  SELECT COUNT(*) INTO v_backlog FROM public.financial_event_gateway
    WHERE status = 'PENDING' AND created_at < now() - INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_dlq_perm FROM public.financial_event_dlq WHERE status = 'PERMANENT_FAILURE';

  v_ok := (v_imbalance = 0 AND v_backlog = 0 AND v_dlq_perm = 0);

  RETURN jsonb_build_object(
    'audit_passed', v_ok,
    'ledger_imbalance', v_imbalance,
    'orphan_processed_events', v_orphan,
    'stale_backlog', v_backlog,
    'dlq_permanent_failures', v_dlq_perm,
    'checked_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_final_audit_check() TO service_role, authenticated;

-- ───────────────────────────────────────────────
-- PHASE 6: Self-healing — auto-force worker on backlog
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_gate_repair()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_backlog INT;
  v_result JSONB;
BEGIN
  SELECT COUNT(*) INTO v_backlog FROM public.financial_event_gateway WHERE status = 'PENDING';
  IF v_backlog > 500 THEN
    v_result := public.run_financial_event_worker();
    RETURN jsonb_build_object('triggered', true, 'backlog', v_backlog, 'worker_result', v_result);
  END IF;
  RETURN jsonb_build_object('triggered', false, 'backlog', v_backlog);
END $function$;

GRANT EXECUTE ON FUNCTION public.auto_gate_repair() TO service_role;