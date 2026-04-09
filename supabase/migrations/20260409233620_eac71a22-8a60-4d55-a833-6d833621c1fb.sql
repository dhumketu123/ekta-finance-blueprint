
-- =============================================
-- MODULE 1: EVENT PROCESSOR ENGINE
-- =============================================

-- Extend system_events for processing
ALTER TABLE public.system_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_system_events_pending
  ON public.system_events (status, next_retry_at)
  WHERE status IN ('pending', 'retrying');

-- Dead letter for permanently failed events
CREATE TABLE IF NOT EXISTS public.system_event_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL,
  event_type text NOT NULL,
  source_module text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb DEFAULT '{}',
  correlation_id text,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_event_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access dead letter events"
  ON public.system_event_dead_letter FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Event processor function
CREATE OR REPLACE FUNCTION public.fn_process_system_events(p_batch_size int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_processed int := 0;
  v_failed int := 0;
  v_dead_lettered int := 0;
  v_backoff interval[];
  v_lock_acquired boolean;
BEGIN
  -- Advisory lock to prevent concurrent processing
  SELECT pg_try_advisory_lock(hashtext('event_processor')) INTO v_lock_acquired;
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another processor running');
  END IF;

  v_backoff := ARRAY['1 minute'::interval, '5 minutes'::interval, '15 minutes'::interval];

  FOR v_row IN
    SELECT * FROM public.system_events
    WHERE status IN ('pending', 'retrying')
      AND next_retry_at <= now()
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Route by event_type
      CASE v_row.event_type
        WHEN 'sms.dead_letter' THEN
          -- Alert + audit log
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('sms_dead_letter_alert', 'event_processor:' || v_row.id::text, true, 0)
          ON CONFLICT DO NOTHING;

          PERFORM public.fn_emit_event(
            'system.alert', 'event_processor', 'sms', v_row.entity_id,
            jsonb_build_object('alert_type', 'sms_dead_letter', 'original_event', v_row.id)
          );

        WHEN 'ledger.mismatch_detected' THEN
          -- Escalate to anomaly engine
          INSERT INTO public.ai_insights (
            title, description, insight_type, severity_score,
            classification_tier, recommended_action, accountable_entity,
            impact_estimate, status
          ) VALUES (
            'Ledger Mismatch Escalation',
            'Auto-escalated from event bus: ' || coalesce(v_row.payload->>'detail', 'unknown'),
            'anomaly', 80,
            'high_risk', 'Review ledger mismatch immediately',
            coalesce(v_row.payload->>'reference_type', 'ledger'),
            'Potential financial discrepancy detected',
            'active'
          );

        WHEN 'anomaly.freeze_required' THEN
          -- System freeze workflow — log + emit freeze signal
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('system_freeze_triggered', 'anomaly:' || coalesce(v_row.entity_id, 'unknown'), true, 0);

          PERFORM public.fn_emit_event(
            'system.freeze_activated', 'event_processor', 
            coalesce(v_row.entity_type, 'system'), v_row.entity_id,
            jsonb_build_object('reason', 'anomaly_freeze_required', 'source_event', v_row.id)
          );

        WHEN 'cron.failed' THEN
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('cron_failure_logged', 'event_processor:' || coalesce(v_row.entity_id, 'unknown'), true, 0);

        ELSE
          -- Default: mark as processed (no specific handler)
          NULL;
      END CASE;

      -- Mark processed
      UPDATE public.system_events
      SET status = 'processed', processed_at = now(), processed = true,
          attempts = attempts + 1
      WHERE id = v_row.id;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Retry or dead-letter
      IF v_row.attempts + 1 >= v_row.max_attempts THEN
        -- Dead letter
        INSERT INTO public.system_event_dead_letter (
          original_event_id, event_type, source_module, entity_type,
          entity_id, payload, correlation_id, attempts, last_error
        ) VALUES (
          v_row.id, v_row.event_type, v_row.source_module, v_row.entity_type,
          v_row.entity_id, v_row.payload, v_row.correlation_id,
          v_row.attempts + 1, SQLERRM
        );

        UPDATE public.system_events
        SET status = 'dead_letter', last_error = SQLERRM,
            attempts = attempts + 1, processed_at = now()
        WHERE id = v_row.id;

        v_dead_lettered := v_dead_lettered + 1;
      ELSE
        UPDATE public.system_events
        SET status = 'retrying',
            attempts = attempts + 1,
            last_error = SQLERRM,
            next_retry_at = now() + v_backoff[LEAST(v_row.attempts + 1, 3)]
        WHERE id = v_row.id;

        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  PERFORM pg_advisory_unlock(hashtext('event_processor'));

  RETURN jsonb_build_object(
    'processed', v_processed,
    'retrying', v_failed,
    'dead_lettered', v_dead_lettered,
    'batch_size', p_batch_size,
    'run_at', now()
  );
END;
$$;

-- =============================================
-- MODULE 2: SAGA TRANSACTION LAYER
-- =============================================

CREATE TABLE IF NOT EXISTS public.saga_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_type text NOT NULL,
  correlation_id text NOT NULL,
  tenant_id text,
  status text NOT NULL DEFAULT 'running',
  steps jsonb NOT NULL DEFAULT '[]',
  current_step int NOT NULL DEFAULT 0,
  total_steps int NOT NULL DEFAULT 0,
  context jsonb DEFAULT '{}',
  error_log jsonb DEFAULT '[]',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saga_status ON public.saga_transactions (status) WHERE status = 'running';
CREATE INDEX idx_saga_correlation ON public.saga_transactions (correlation_id);

ALTER TABLE public.saga_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access sagas"
  ON public.saga_transactions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Execute next saga step
CREATE OR REPLACE FUNCTION public.fn_saga_execute_step(
  p_saga_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saga record;
  v_step jsonb;
  v_step_name text;
BEGIN
  SELECT * INTO v_saga FROM public.saga_transactions
  WHERE id = p_saga_id AND status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'saga not found or not running');
  END IF;

  IF v_saga.current_step >= v_saga.total_steps THEN
    UPDATE public.saga_transactions
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = p_saga_id;
    RETURN jsonb_build_object('status', 'completed', 'saga_id', p_saga_id);
  END IF;

  v_step := v_saga.steps -> v_saga.current_step;
  v_step_name := v_step ->> 'name';

  BEGIN
    -- Mark step as executing
    UPDATE public.saga_transactions
    SET steps = jsonb_set(steps, ARRAY[v_saga.current_step::text, 'status'], '"executing"'),
        updated_at = now()
    WHERE id = p_saga_id;

    -- Mark step completed + advance
    UPDATE public.saga_transactions
    SET current_step = current_step + 1,
        steps = jsonb_set(steps, ARRAY[v_saga.current_step::text, 'status'], '"completed"'),
        updated_at = now()
    WHERE id = p_saga_id;

    PERFORM public.fn_emit_event(
      'saga.step_completed', 'saga_engine', 'saga', p_saga_id::text,
      jsonb_build_object('step', v_step_name, 'step_index', v_saga.current_step)
    );

    RETURN jsonb_build_object('status', 'step_completed', 'step', v_step_name);

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.saga_transactions
    SET status = 'compensating',
        steps = jsonb_set(steps, ARRAY[v_saga.current_step::text, 'status'], '"failed"'),
        error_log = error_log || jsonb_build_object('step', v_step_name, 'error', SQLERRM, 'at', now()),
        updated_at = now()
    WHERE id = p_saga_id;

    PERFORM public.fn_saga_compensate(p_saga_id);
    RETURN jsonb_build_object('status', 'compensating', 'failed_step', v_step_name, 'error', SQLERRM);
  END;
END;
$$;

-- Compensate saga (reverse completed steps)
CREATE OR REPLACE FUNCTION public.fn_saga_compensate(p_saga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saga record;
  v_i int;
  v_step jsonb;
  v_compensated int := 0;
BEGIN
  SELECT * INTO v_saga FROM public.saga_transactions WHERE id = p_saga_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not found'); END IF;

  -- Reverse through completed steps
  FOR v_i IN REVERSE (v_saga.current_step - 1)..0 LOOP
    v_step := v_saga.steps -> v_i;
    IF (v_step ->> 'status') = 'completed' THEN
      UPDATE public.saga_transactions
      SET steps = jsonb_set(steps, ARRAY[v_i::text, 'status'], '"compensated"'),
          updated_at = now()
      WHERE id = p_saga_id;
      v_compensated := v_compensated + 1;
    END IF;
  END LOOP;

  UPDATE public.saga_transactions
  SET status = 'rolled_back', completed_at = now(), updated_at = now()
  WHERE id = p_saga_id;

  PERFORM public.fn_emit_event(
    'saga.rolled_back', 'saga_engine', 'saga', p_saga_id::text,
    jsonb_build_object('compensated_steps', v_compensated)
  );

  RETURN jsonb_build_object('status', 'rolled_back', 'compensated_steps', v_compensated);
END;
$$;

-- =============================================
-- MODULE 3: RATE LIMITING + THROTTLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL UNIQUE,
  module text NOT NULL,
  tenant_id text,
  max_tokens int NOT NULL DEFAULT 100,
  current_tokens int NOT NULL DEFAULT 100,
  refill_rate int NOT NULL DEFAULT 10,
  refill_interval_seconds int NOT NULL DEFAULT 60,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rate_limit_key ON public.rate_limit_buckets (bucket_key);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access rate limits"
  ON public.rate_limit_buckets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Token bucket check + consume
CREATE OR REPLACE FUNCTION public.fn_rate_limit_check(
  p_bucket_key text,
  p_module text DEFAULT 'general',
  p_tenant_id text DEFAULT null,
  p_tokens_needed int DEFAULT 1,
  p_max_tokens int DEFAULT 100,
  p_refill_rate int DEFAULT 10,
  p_refill_interval int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket record;
  v_elapsed_seconds numeric;
  v_refill_tokens int;
  v_new_tokens int;
  v_allowed boolean;
BEGIN
  -- Upsert bucket
  INSERT INTO public.rate_limit_buckets (bucket_key, module, tenant_id, max_tokens, current_tokens, refill_rate, refill_interval_seconds)
  VALUES (p_bucket_key, p_module, p_tenant_id, p_max_tokens, p_max_tokens, p_refill_rate, p_refill_interval)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_bucket FROM public.rate_limit_buckets
  WHERE bucket_key = p_bucket_key FOR UPDATE;

  -- Refill tokens based on elapsed time
  v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_bucket.last_refill_at));
  v_refill_tokens := FLOOR(v_elapsed_seconds / v_bucket.refill_interval_seconds) * v_bucket.refill_rate;

  IF v_refill_tokens > 0 THEN
    v_new_tokens := LEAST(v_bucket.max_tokens, v_bucket.current_tokens + v_refill_tokens);
    UPDATE public.rate_limit_buckets
    SET current_tokens = v_new_tokens, last_refill_at = now(), updated_at = now()
    WHERE id = v_bucket.id;
    v_bucket.current_tokens := v_new_tokens;
  END IF;

  -- Check availability
  v_allowed := v_bucket.current_tokens >= p_tokens_needed;

  IF v_allowed THEN
    UPDATE public.rate_limit_buckets
    SET current_tokens = current_tokens - p_tokens_needed, updated_at = now()
    WHERE id = v_bucket.id;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining_tokens', CASE WHEN v_allowed THEN v_bucket.current_tokens - p_tokens_needed ELSE v_bucket.current_tokens END,
    'bucket_key', p_bucket_key,
    'checked_at', now()
  );
END;
$$;

-- =============================================
-- MODULE 4: METRICS TIME SERIES ENGINE
-- =============================================

CREATE TABLE IF NOT EXISTS public.system_metrics_ts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_metrics_ts_type_time ON public.system_metrics_ts (metric_type, snapshot_at DESC);

ALTER TABLE public.system_metrics_ts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read metrics"
  ON public.system_metrics_ts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin write metrics"
  ON public.system_metrics_ts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access metrics"
  ON public.system_metrics_ts FOR ALL
  TO service_role USING (true);

-- Snapshot system metrics
CREATE OR REPLACE FUNCTION public.fn_snapshot_system_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_health_score numeric;
  v_sms_pending int;
  v_sms_failed int;
  v_sms_total int;
  v_sms_sla numeric;
  v_mismatch_count int;
  v_cron_ok int;
  v_cron_stale int;
  v_events_pending int;
  v_events_dead int;
BEGIN
  -- Health score from heartbeat
  BEGIN
    SELECT (result->>'health_score')::numeric INTO v_health_score
    FROM (SELECT public.fn_system_health_status() as result) sub;
  EXCEPTION WHEN OTHERS THEN
    v_health_score := -1;
  END;

  -- SMS metrics
  SELECT count(*) FILTER (WHERE status = 'pending'),
         count(*) FILTER (WHERE status = 'failed'),
         count(*)
  INTO v_sms_pending, v_sms_failed, v_sms_total
  FROM public.sms_delivery_queue
  WHERE created_at > now() - interval '1 hour';

  v_sms_sla := CASE WHEN v_sms_total > 0
    THEN round(((v_sms_total - v_sms_failed)::numeric / v_sms_total) * 100, 2)
    ELSE 100 END;

  -- Ledger mismatches (unresolved)
  SELECT count(*) INTO v_mismatch_count
  FROM public.ledger_mismatches WHERE resolved = false;

  -- Cron health
  SELECT count(*) FILTER (WHERE last_run_at > now() - (max_delay_minutes || ' minutes')::interval),
         count(*) FILTER (WHERE last_run_at <= now() - (max_delay_minutes || ' minutes')::interval)
  INTO v_cron_ok, v_cron_stale
  FROM public.cron_heartbeats;

  -- Event bus health
  SELECT count(*) FILTER (WHERE status IN ('pending','retrying')),
         count(*) FILTER (WHERE status = 'dead_letter')
  INTO v_events_pending, v_events_dead
  FROM public.system_events
  WHERE created_at > now() - interval '1 hour';

  -- Insert snapshots
  INSERT INTO public.system_metrics_ts (metric_type, metric_value, metadata) VALUES
    ('health_score', coalesce(v_health_score, 0), '{}'),
    ('sms_sla_percent', v_sms_sla, jsonb_build_object('pending', v_sms_pending, 'failed', v_sms_failed)),
    ('ledger_mismatches', v_mismatch_count, '{}'),
    ('cron_health', v_cron_ok, jsonb_build_object('stale', v_cron_stale)),
    ('event_bus_health', v_events_pending, jsonb_build_object('dead_letter', v_events_dead));

  RETURN jsonb_build_object(
    'health_score', v_health_score,
    'sms_sla', v_sms_sla,
    'ledger_mismatches', v_mismatch_count,
    'cron_ok', v_cron_ok,
    'cron_stale', v_cron_stale,
    'events_pending', v_events_pending,
    'events_dead', v_events_dead,
    'snapshot_at', now()
  );
END;
$$;

-- Degradation detection
CREATE OR REPLACE FUNCTION public.fn_detect_degradation(
  p_metric_type text DEFAULT 'health_score',
  p_lookback_minutes int DEFAULT 30,
  p_threshold_drop numeric DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent numeric;
  v_baseline numeric;
  v_drop numeric;
  v_degraded boolean;
BEGIN
  -- Recent average (last 5 min)
  SELECT avg(metric_value) INTO v_recent
  FROM public.system_metrics_ts
  WHERE metric_type = p_metric_type
    AND snapshot_at > now() - interval '5 minutes';

  -- Baseline average (lookback window)
  SELECT avg(metric_value) INTO v_baseline
  FROM public.system_metrics_ts
  WHERE metric_type = p_metric_type
    AND snapshot_at BETWEEN now() - (p_lookback_minutes || ' minutes')::interval
                        AND now() - interval '5 minutes';

  v_drop := CASE WHEN v_baseline > 0 THEN v_baseline - coalesce(v_recent, 0) ELSE 0 END;
  v_degraded := v_drop >= p_threshold_drop;

  IF v_degraded THEN
    PERFORM public.fn_emit_event(
      'system.degradation_detected', 'metrics_engine', 'metric', p_metric_type,
      jsonb_build_object('recent_avg', v_recent, 'baseline_avg', v_baseline, 'drop', v_drop)
    );
  END IF;

  RETURN jsonb_build_object(
    'metric', p_metric_type,
    'recent_avg', round(coalesce(v_recent, 0), 2),
    'baseline_avg', round(coalesce(v_baseline, 0), 2),
    'drop', round(v_drop, 2),
    'degraded', v_degraded,
    'threshold', p_threshold_drop
  );
END;
$$;

-- =============================================
-- CRON JOBS
-- =============================================

-- Event processor: every 1 minute
SELECT cron.schedule(
  'event-processor',
  '* * * * *',
  $$SELECT public.fn_process_system_events(50)$$
);

-- Metrics snapshot: every 5 minutes
SELECT cron.schedule(
  'metrics-snapshot-5m',
  '*/5 * * * *',
  $$SELECT public.fn_snapshot_system_metrics()$$
);

-- Degradation check: every 10 minutes
SELECT cron.schedule(
  'degradation-check-10m',
  '*/10 * * * *',
  $$SELECT public.fn_detect_degradation('health_score', 30, 15)$$
);

-- Register heartbeats
INSERT INTO public.cron_heartbeats (job_name, last_run_at, max_delay_minutes, status)
VALUES
  ('event-processor', now(), 3, 'ok'),
  ('metrics-snapshot-5m', now(), 10, 'ok'),
  ('degradation-check-10m', now(), 15, 'ok')
ON CONFLICT DO NOTHING;
