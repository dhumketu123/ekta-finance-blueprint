
-- GAP 1: Deadlock safety
ALTER TABLE public.system_events ADD COLUMN IF NOT EXISTS lock_acquired_at timestamptz;

-- GAP 2: Stale processing lock cleaner
CREATE OR REPLACE FUNCTION public.fn_cleanup_stale_processing_locks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.system_events
  SET processing_lock = NULL, lock_acquired_at = NULL
  WHERE processing_lock IS NOT NULL
    AND processed = false
    AND (lock_acquired_at < now() - interval '10 minutes'
         OR (lock_acquired_at IS NULL AND created_at < now() - interval '10 minutes'));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
    VALUES ('stale_lock_cleanup', 'cron:stale-lock-cleaner:' || v_count, true, 0);
  END IF;

  RETURN jsonb_build_object('stale_locks_cleared', v_count, 'run_at', now());
END;
$$;

-- GAP 3: Safe refill calc
CREATE OR REPLACE FUNCTION public.fn_safe_refill_calc(
  p_elapsed numeric, p_interval int, p_rate int, p_max int, p_current int
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_refill int;
BEGIN
  IF p_interval IS NULL OR p_interval <= 0 OR p_elapsed IS NULL OR p_elapsed < 0 THEN
    RETURN LEAST(p_max, p_current);
  END IF;
  v_refill := GREATEST(0, FLOOR(p_elapsed / p_interval)::int * COALESCE(p_rate, 0));
  RETURN LEAST(p_max, p_current + v_refill);
END;
$$;

-- Patch fn_rate_limit_check to use safe refill
CREATE OR REPLACE FUNCTION public.fn_rate_limit_check(
  p_bucket_key text, p_module text DEFAULT 'general', p_tenant_id text DEFAULT null,
  p_tokens_needed int DEFAULT 1, p_max_tokens int DEFAULT 100,
  p_refill_rate int DEFAULT 10, p_refill_interval int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_bucket record; v_elapsed numeric; v_new int; v_allowed boolean;
BEGIN
  INSERT INTO public.rate_limit_buckets (bucket_key, module, tenant_id, max_tokens, current_tokens, refill_rate, refill_interval_seconds)
  VALUES (p_bucket_key, p_module, p_tenant_id, p_max_tokens, p_max_tokens, p_refill_rate, p_refill_interval)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_bucket FROM public.rate_limit_buckets WHERE bucket_key = p_bucket_key FOR UPDATE;
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_bucket.last_refill_at));
  v_new := public.fn_safe_refill_calc(v_elapsed, v_bucket.refill_interval_seconds, v_bucket.refill_rate, v_bucket.max_tokens, v_bucket.current_tokens);

  IF v_new > v_bucket.current_tokens THEN
    UPDATE public.rate_limit_buckets SET current_tokens = v_new, last_refill_at = now(), updated_at = now() WHERE id = v_bucket.id;
    v_bucket.current_tokens := v_new;
  END IF;

  v_allowed := v_bucket.current_tokens >= p_tokens_needed;
  IF v_allowed THEN
    UPDATE public.rate_limit_buckets SET current_tokens = current_tokens - p_tokens_needed, updated_at = now() WHERE id = v_bucket.id;
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'remaining_tokens',
    CASE WHEN v_allowed THEN v_bucket.current_tokens - p_tokens_needed ELSE v_bucket.current_tokens END,
    'bucket_key', p_bucket_key, 'checked_at', now());
END;
$$;

-- GAP 4: Saga double execution protection
ALTER TABLE public.saga_transactions ADD COLUMN IF NOT EXISTS execution_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_saga_fingerprint ON public.saga_transactions(execution_fingerprint) WHERE execution_fingerprint IS NOT NULL;

-- GAP 5: Event sequence ordering
ALTER TABLE public.system_events ADD COLUMN IF NOT EXISTS sequence_no bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS idx_event_sequence ON public.system_events(sequence_no);

-- GAP 6: Circuit breaker state persistence
CREATE TABLE IF NOT EXISTS public.circuit_breaker_state (
  id text PRIMARY KEY,
  failure_count int DEFAULT 0,
  state text DEFAULT 'closed',
  last_trip_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin circuit breaker" ON public.circuit_breaker_state FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Upgrade circuit guard to use persistent state
CREATE OR REPLACE FUNCTION public.fn_system_circuit_guard(p_queue_depth int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_state record;
BEGIN
  INSERT INTO public.circuit_breaker_state (id, failure_count, state)
  VALUES ('event_processor', 0, 'closed')
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_state FROM public.circuit_breaker_state WHERE id = 'event_processor' FOR UPDATE;

  IF p_queue_depth > 2000 THEN
    UPDATE public.circuit_breaker_state
    SET state = 'open', failure_count = failure_count + 1, last_trip_at = now(), updated_at = now()
    WHERE id = 'event_processor';
    RETURN jsonb_build_object('status', 'circuit_open', 'reason', 'queue_overflow', 'failure_count', v_state.failure_count + 1, 'action', 'system_throttled');
  ELSIF v_state.state = 'open' AND v_state.last_trip_at < now() - interval '5 minutes' THEN
    UPDATE public.circuit_breaker_state SET state = 'half_open', updated_at = now() WHERE id = 'event_processor';
    RETURN jsonb_build_object('status', 'half_open', 'reason', 'cooldown_expired');
  ELSIF v_state.state = 'half_open' AND p_queue_depth < 500 THEN
    UPDATE public.circuit_breaker_state SET state = 'closed', failure_count = 0, updated_at = now() WHERE id = 'event_processor';
    RETURN jsonb_build_object('status', 'ok', 'reason', 'recovered');
  ELSIF v_state.state = 'open' THEN
    RETURN jsonb_build_object('status', 'circuit_open', 'reason', 'still_tripped');
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- GAP 7: Global observability hook
CREATE OR REPLACE FUNCTION public.fn_global_observability_hook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trace non-trace events to prevent infinite recursion
  IF NEW.event_type IS NULL OR NEW.event_type != 'system.trace' THEN
    INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
    VALUES ('observability_trace', TG_TABLE_NAME || ':' || TG_OP || ':' || NEW.id::text, true, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_trace ON public.system_events;
CREATE TRIGGER trg_events_trace
AFTER INSERT ON public.system_events
FOR EACH ROW EXECUTE FUNCTION public.fn_global_observability_hook();

-- GAP 8: Stale lock cleaner cron
SELECT cron.schedule('stale-lock-cleaner', '*/5 * * * *', $$SELECT public.fn_cleanup_stale_processing_locks()$$);

INSERT INTO public.cron_heartbeats (job_name, last_run_at, max_delay_minutes, status)
VALUES ('stale-lock-cleaner', now(), 10, 'ok')
ON CONFLICT DO NOTHING;

-- Patch event processor to set lock_acquired_at
CREATE OR REPLACE FUNCTION public.fn_process_system_events(p_batch_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record; v_processed int := 0; v_failed int := 0; v_dead_lettered int := 0;
  v_skipped int := 0; v_backoff interval[]; v_lock_acquired boolean;
  v_queue_depth int; v_effective_batch int; v_degraded boolean := false;
  v_ctrl record; v_circuit jsonb; v_lock_id text;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '60s';

  SELECT pg_try_advisory_lock(hashtext('global_event_processor')) INTO v_lock_acquired;
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another processor running');
  END IF;

  SELECT * INTO v_ctrl FROM public.system_control LIMIT 1;
  IF v_ctrl IS NOT NULL AND (v_ctrl.events_paused OR v_ctrl.system_status = 'frozen') THEN
    PERFORM pg_advisory_unlock(hashtext('global_event_processor'));
    RETURN jsonb_build_object('skipped', true, 'reason', 'events_paused_or_frozen');
  END IF;

  SELECT count(*) INTO v_queue_depth FROM public.system_events WHERE status IN ('pending', 'retrying');
  v_circuit := public.fn_system_circuit_guard(v_queue_depth);
  IF (v_circuit->>'status') = 'circuit_open' THEN
    PERFORM pg_advisory_unlock(hashtext('global_event_processor'));
    PERFORM public.fn_emit_event('system.circuit_open', 'event_processor', 'system', null,
      jsonb_build_object('queue_depth', v_queue_depth));
    RETURN jsonb_build_object('skipped', true, 'reason', 'circuit_breaker_open', 'queue_depth', v_queue_depth);
  END IF;

  v_effective_batch := LEAST(500, GREATEST(p_batch_size, v_queue_depth / 2));
  v_degraded := v_queue_depth > 500;
  v_backoff := ARRAY['1 minute'::interval, '5 minutes'::interval, '15 minutes'::interval];

  FOR v_row IN
    SELECT * FROM public.system_events
    WHERE status IN ('pending', 'retrying') AND next_retry_at <= now() AND overload_blocked = false
    ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, sequence_no ASC
    LIMIT v_effective_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_degraded AND v_row.priority = 'low' THEN
      UPDATE public.system_events SET overload_blocked = true WHERE id = v_row.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_lock_id := 'proc_' || v_row.id::text;
    BEGIN
      UPDATE public.system_events SET processing_lock = v_lock_id, lock_acquired_at = now() WHERE id = v_row.id AND processing_lock IS NULL;
      IF NOT FOUND THEN CONTINUE; END IF;
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;

    BEGIN
      CASE v_row.event_type
        WHEN 'sms.dead_letter' THEN
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('sms_dead_letter_alert', 'event_processor:' || v_row.id::text, true, 0) ON CONFLICT DO NOTHING;
          PERFORM public.fn_emit_event('system.alert', 'event_processor', 'sms', v_row.entity_id,
            jsonb_build_object('alert_type', 'sms_dead_letter', 'original_event', v_row.id));
        WHEN 'ledger.mismatch_detected' THEN
          INSERT INTO public.ai_insights (title, description, insight_type, severity_score, classification_tier, recommended_action, accountable_entity, impact_estimate, status)
          VALUES ('Ledger Mismatch Escalation', 'Auto-escalated: ' || coalesce(v_row.payload->>'detail', 'unknown'),
            'anomaly', 80, 'high_risk', 'Review immediately', coalesce(v_row.payload->>'reference_type', 'ledger'), 'Financial discrepancy', 'active');
        WHEN 'anomaly.freeze_required' THEN
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('system_freeze_triggered', 'anomaly:' || coalesce(v_row.entity_id, 'unknown'), true, 0);
          PERFORM public.fn_emit_event('system.freeze_activated', 'event_processor',
            coalesce(v_row.entity_type, 'system'), v_row.entity_id,
            jsonb_build_object('reason', 'anomaly_freeze_required', 'source_event', v_row.id));
        WHEN 'cron.failed' THEN
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('cron_failure_logged', 'event_processor:' || coalesce(v_row.entity_id, 'unknown'), true, 0);
        ELSE NULL;
      END CASE;

      UPDATE public.system_events SET status = 'processed', processed_at = now(), processed = true, attempts = attempts + 1 WHERE id = v_row.id;
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.event_failure_clusters (event_type, source_module, failure_count, last_seen, metadata)
      VALUES (v_row.event_type, v_row.source_module, 1, now(), jsonb_build_object('error', SQLERRM))
      ON CONFLICT DO NOTHING;
      UPDATE public.event_failure_clusters SET failure_count = failure_count + 1, last_seen = now(),
        metadata = jsonb_build_object('last_error', SQLERRM) WHERE event_type = v_row.event_type AND source_module = v_row.source_module;

      IF v_row.attempts + 1 >= v_row.max_attempts THEN
        INSERT INTO public.system_event_dead_letter (original_event_id, event_type, source_module, entity_type, entity_id, payload, correlation_id, attempts, last_error)
        VALUES (v_row.id, v_row.event_type, v_row.source_module, v_row.entity_type, v_row.entity_id, v_row.payload, v_row.correlation_id, v_row.attempts + 1, SQLERRM);
        UPDATE public.system_events SET status = 'dead_letter', last_error = SQLERRM, attempts = attempts + 1, processed_at = now() WHERE id = v_row.id;
        v_dead_lettered := v_dead_lettered + 1;
      ELSE
        UPDATE public.system_events SET status = 'retrying', attempts = attempts + 1, last_error = SQLERRM,
          next_retry_at = now() + v_backoff[LEAST(v_row.attempts + 1, 3)] WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  PERFORM pg_advisory_unlock(hashtext('global_event_processor'));

  RETURN jsonb_build_object(
    'processed', v_processed, 'retrying', v_failed, 'dead_lettered', v_dead_lettered,
    'skipped_low_priority', v_skipped, 'queue_depth', v_queue_depth,
    'effective_batch', v_effective_batch, 'degraded_mode', v_degraded, 'run_at', now()
  );
END;
$$;
