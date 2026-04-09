
-- 1. Event processing identity lock
ALTER TABLE public.system_events ADD COLUMN IF NOT EXISTS processing_lock text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_events_processing_lock ON public.system_events(processing_lock) WHERE processing_lock IS NOT NULL;

-- 2. Saga atomic step state
ALTER TABLE public.saga_transactions ADD COLUMN IF NOT EXISTS step_state jsonb DEFAULT '{}';

-- 3. Control plane singleton
ALTER TABLE public.system_control ADD COLUMN IF NOT EXISTS singleton_key boolean DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_control_singleton ON public.system_control(singleton_key);
UPDATE public.system_control SET singleton_key = true WHERE singleton_key IS NULL;

-- 5. Backpressure flag
ALTER TABLE public.system_events ADD COLUMN IF NOT EXISTS overload_blocked boolean DEFAULT false;

-- 6. Failure clustering
CREATE TABLE IF NOT EXISTS public.event_failure_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  source_module text NOT NULL,
  failure_count int DEFAULT 0,
  last_seen timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_event_cluster_lookup ON public.event_failure_clusters (event_type, source_module);
ALTER TABLE public.event_failure_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin access failure clusters" ON public.event_failure_clusters FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 7. Cron global locks
CREATE TABLE IF NOT EXISTS public.cron_global_locks (
  job_name text PRIMARY KEY,
  locked_at timestamptz DEFAULT now()
);
ALTER TABLE public.cron_global_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin access cron locks" ON public.cron_global_locks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. Circuit breaker function
CREATE OR REPLACE FUNCTION public.fn_system_circuit_guard(p_queue_depth int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_queue_depth > 2000 THEN
    RETURN jsonb_build_object('status', 'circuit_open', 'reason', 'queue_overflow', 'action', 'system_throttled');
  END IF;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- 4+9+10. Hardened rate limit (cap refill) + Event processor v3 (all fixes integrated)
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
DECLARE
  v_bucket record; v_elapsed numeric; v_refill int; v_new int; v_allowed boolean;
BEGIN
  INSERT INTO public.rate_limit_buckets (bucket_key, module, tenant_id, max_tokens, current_tokens, refill_rate, refill_interval_seconds)
  VALUES (p_bucket_key, p_module, p_tenant_id, p_max_tokens, p_max_tokens, p_refill_rate, p_refill_interval)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_bucket FROM public.rate_limit_buckets WHERE bucket_key = p_bucket_key FOR UPDATE;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_bucket.last_refill_at));
  v_refill := LEAST(v_bucket.max_tokens, FLOOR(v_elapsed / v_bucket.refill_interval_seconds)::int * v_bucket.refill_rate);

  IF v_refill > 0 THEN
    v_new := LEAST(v_bucket.max_tokens, v_bucket.current_tokens + v_refill);
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

-- Event processor v3 with all hardening
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
  SELECT pg_try_advisory_lock(hashtext('global_event_processor')) INTO v_lock_acquired;
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another processor running');
  END IF;

  -- Control plane check
  SELECT * INTO v_ctrl FROM public.system_control LIMIT 1;
  IF v_ctrl IS NOT NULL AND (v_ctrl.events_paused OR v_ctrl.system_status = 'frozen') THEN
    PERFORM pg_advisory_unlock(hashtext('global_event_processor'));
    RETURN jsonb_build_object('skipped', true, 'reason', 'events_paused_or_frozen');
  END IF;

  -- Queue depth + circuit breaker
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
    ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at ASC
    LIMIT v_effective_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_degraded AND v_row.priority = 'low' THEN
      UPDATE public.system_events SET overload_blocked = true WHERE id = v_row.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Idempotency lock
    v_lock_id := 'proc_' || v_row.id::text;
    BEGIN
      UPDATE public.system_events SET processing_lock = v_lock_id WHERE id = v_row.id AND processing_lock IS NULL;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE; -- already being processed
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
            'anomaly', 80, 'high_risk', 'Review ledger mismatch immediately',
            coalesce(v_row.payload->>'reference_type', 'ledger'), 'Financial discrepancy detected', 'active');
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

      UPDATE public.system_events
      SET status = 'processed', processed_at = now(), processed = true, attempts = attempts + 1
      WHERE id = v_row.id;
      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Cluster failures
      INSERT INTO public.event_failure_clusters (event_type, source_module, failure_count, last_seen, metadata)
      VALUES (v_row.event_type, v_row.source_module, 1, now(), jsonb_build_object('error', SQLERRM))
      ON CONFLICT DO NOTHING;

      UPDATE public.event_failure_clusters
      SET failure_count = failure_count + 1, last_seen = now(),
          metadata = jsonb_build_object('last_error', SQLERRM)
      WHERE event_type = v_row.event_type AND source_module = v_row.source_module;

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
