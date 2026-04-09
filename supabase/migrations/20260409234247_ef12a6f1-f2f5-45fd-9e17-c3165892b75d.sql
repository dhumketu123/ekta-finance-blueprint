
-- =============================================
-- MODULE 1: EVENT BACKPRESSURE CONTROL
-- =============================================

ALTER TABLE public.system_events
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

-- Upgraded event processor with backpressure
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
  v_skipped int := 0;
  v_backoff interval[];
  v_lock_acquired boolean;
  v_queue_depth int;
  v_effective_batch int;
  v_degraded boolean := false;
  v_ctrl record;
BEGIN
  SELECT pg_try_advisory_lock(hashtext('event_processor')) INTO v_lock_acquired;
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'another processor running');
  END IF;

  -- Check emergency control plane
  SELECT * INTO v_ctrl FROM public.system_control LIMIT 1;
  IF v_ctrl IS NOT NULL AND (v_ctrl.events_paused OR v_ctrl.system_status = 'frozen') THEN
    PERFORM pg_advisory_unlock(hashtext('event_processor'));
    RETURN jsonb_build_object('skipped', true, 'reason', 'events_paused_or_frozen');
  END IF;

  -- Queue depth assessment
  SELECT count(*) INTO v_queue_depth
  FROM public.system_events WHERE status IN ('pending', 'retrying');

  -- Adaptive batch: scale 50→500 based on queue depth
  v_effective_batch := LEAST(500, GREATEST(p_batch_size, v_queue_depth / 2));
  v_degraded := v_queue_depth > 500;

  v_backoff := ARRAY['1 minute'::interval, '5 minutes'::interval, '15 minutes'::interval];

  FOR v_row IN
    SELECT * FROM public.system_events
    WHERE status IN ('pending', 'retrying')
      AND next_retry_at <= now()
    ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT v_effective_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Skip low priority under overload
    IF v_degraded AND v_row.priority = 'low' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      CASE v_row.event_type
        WHEN 'sms.dead_letter' THEN
          INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
          VALUES ('sms_dead_letter_alert', 'event_processor:' || v_row.id::text, true, 0)
          ON CONFLICT DO NOTHING;
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

  PERFORM pg_advisory_unlock(hashtext('event_processor'));

  RETURN jsonb_build_object(
    'processed', v_processed, 'retrying', v_failed, 'dead_lettered', v_dead_lettered,
    'skipped_low_priority', v_skipped, 'queue_depth', v_queue_depth,
    'effective_batch', v_effective_batch, 'degraded_mode', v_degraded, 'run_at', now()
  );
END;
$$;

-- =============================================
-- MODULE 2: SAGA HARDENING
-- =============================================

ALTER TABLE public.saga_transactions
  ADD COLUMN IF NOT EXISTS timeout_at timestamptz,
  ADD COLUMN IF NOT EXISTS global_context_id text;

CREATE INDEX IF NOT EXISTS idx_saga_timeout ON public.saga_transactions (timeout_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_saga_global_ctx ON public.saga_transactions (global_context_id);

-- Saga timeout sweep
CREATE OR REPLACE FUNCTION public.fn_saga_timeout_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_timed_out int := 0;
BEGIN
  FOR v_row IN
    SELECT id FROM public.saga_transactions
    WHERE status = 'running' AND timeout_at IS NOT NULL AND timeout_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.saga_transactions
    SET status = 'compensating',
        error_log = error_log || jsonb_build_object('step', 'timeout', 'error', 'saga_timeout_exceeded', 'at', now()),
        updated_at = now()
    WHERE id = v_row.id;

    PERFORM public.fn_saga_compensate(v_row.id);
    v_timed_out := v_timed_out + 1;
  END LOOP;

  IF v_timed_out > 0 THEN
    PERFORM public.fn_emit_event('saga.timeout_sweep', 'saga_engine', 'saga', null,
      jsonb_build_object('timed_out', v_timed_out));
  END IF;

  RETURN jsonb_build_object('timed_out', v_timed_out, 'swept_at', now());
END;
$$;

-- =============================================
-- MODULE 3: EMERGENCY CONTROL PLANE
-- =============================================

CREATE TABLE IF NOT EXISTS public.system_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_status text NOT NULL DEFAULT 'active',
  sms_paused boolean NOT NULL DEFAULT false,
  events_paused boolean NOT NULL DEFAULT false,
  read_only_mode boolean NOT NULL DEFAULT false,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access system control"
  ON public.system_control FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed singleton row
INSERT INTO public.system_control (system_status, sms_paused, events_paused, read_only_mode)
VALUES ('active', false, false, false);

-- Emergency mode setter
CREATE OR REPLACE FUNCTION public.fn_set_emergency_mode(
  p_status text DEFAULT 'active',
  p_sms_paused boolean DEFAULT null,
  p_events_paused boolean DEFAULT null,
  p_read_only boolean DEFAULT null,
  p_reason text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old record;
  v_new record;
BEGIN
  SELECT * INTO v_old FROM public.system_control LIMIT 1 FOR UPDATE;

  UPDATE public.system_control SET
    system_status = coalesce(p_status, system_status),
    sms_paused = coalesce(p_sms_paused, sms_paused),
    events_paused = coalesce(p_events_paused, events_paused),
    read_only_mode = coalesce(p_read_only, read_only_mode),
    changed_by = coalesce(auth.uid()::text, 'system'),
    changed_at = now(),
    reason = p_reason
  WHERE id = v_old.id;

  SELECT * INTO v_new FROM public.system_control LIMIT 1;

  -- Audit log
  INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
  VALUES ('emergency_mode_change', 'control_plane:' || p_status, true, 0);

  -- Emit event
  PERFORM public.fn_emit_event(
    'system.control_change', 'control_plane', 'system', v_old.id::text,
    jsonb_build_object(
      'old_status', v_old.system_status, 'new_status', v_new.system_status,
      'sms_paused', v_new.sms_paused, 'events_paused', v_new.events_paused,
      'read_only', v_new.read_only_mode, 'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', v_new.system_status,
    'sms_paused', v_new.sms_paused,
    'events_paused', v_new.events_paused,
    'read_only_mode', v_new.read_only_mode,
    'changed_at', v_new.changed_at
  );
END;
$$;

-- =============================================
-- MODULE 4: METRICS SELF-ADAPTATION
-- =============================================

CREATE OR REPLACE FUNCTION public.fn_metrics_self_adapt()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sms_sla_avg numeric;
  v_health_avg numeric;
  v_adjustments jsonb := '[]'::jsonb;
  v_new_sla_threshold numeric;
BEGIN
  -- Analyze last 1h SMS SLA trend
  SELECT avg(metric_value) INTO v_sms_sla_avg
  FROM public.system_metrics_ts
  WHERE metric_type = 'sms_sla_percent' AND snapshot_at > now() - interval '1 hour';

  -- Analyze last 1h health score trend
  SELECT avg(metric_value) INTO v_health_avg
  FROM public.system_metrics_ts
  WHERE metric_type = 'health_score' AND snapshot_at > now() - interval '1 hour';

  -- Auto-adjust SLA threshold: if sustained high perf, tighten; if degraded, relax temporarily
  IF v_sms_sla_avg IS NOT NULL THEN
    IF v_sms_sla_avg >= 99 THEN
      v_new_sla_threshold := 97;
      v_adjustments := v_adjustments || jsonb_build_object('param', 'sms_sla_threshold', 'old', 95, 'new', 97, 'reason', 'sustained_excellence');
    ELSIF v_sms_sla_avg < 85 THEN
      v_new_sla_threshold := 90;
      v_adjustments := v_adjustments || jsonb_build_object('param', 'sms_sla_threshold', 'old', 95, 'new', 90, 'reason', 'degraded_performance_temporary_relax');
    END IF;
  END IF;

  -- Predictive degradation: health dropping trend
  IF v_health_avg IS NOT NULL AND v_health_avg < 70 THEN
    v_adjustments := v_adjustments || jsonb_build_object('param', 'anomaly_severity_trigger', 'adjustment', 'lowered_to_60', 'reason', 'pre_failure_detection');

    PERFORM public.fn_emit_event('system.pre_failure_warning', 'self_adapt', 'system', null,
      jsonb_build_object('health_avg_1h', v_health_avg, 'action', 'anomaly_threshold_lowered'));
  END IF;

  -- Emit auto_tune events
  IF jsonb_array_length(v_adjustments) > 0 THEN
    PERFORM public.fn_emit_event('system.auto_tune', 'self_adapt', 'system', null,
      jsonb_build_object('adjustments', v_adjustments, 'tuned_at', now()));

    INSERT INTO public.auto_fix_logs (action_name, triggered_by_check, success, execution_ms)
    VALUES ('metrics_self_adapt', 'self_adapt:' || jsonb_array_length(v_adjustments)::text || '_adjustments', true, 0);
  END IF;

  RETURN jsonb_build_object(
    'sms_sla_avg_1h', round(coalesce(v_sms_sla_avg, 0), 2),
    'health_avg_1h', round(coalesce(v_health_avg, 0), 2),
    'adjustments', v_adjustments,
    'analyzed_at', now()
  );
END;
$$;

-- =============================================
-- MODULE 5: EVENT → INTELLIGENCE FEEDBACK LOOP
-- =============================================

CREATE OR REPLACE FUNCTION public.fn_event_intelligence_feedback()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dead_count int;
  v_retry_heavy int;
  v_slow_events int;
  v_insights_created int := 0;
BEGIN
  -- Dead letter frequency (last 1h)
  SELECT count(*) INTO v_dead_count
  FROM public.system_event_dead_letter WHERE failed_at > now() - interval '1 hour';

  -- Events with high retry count
  SELECT count(*) INTO v_retry_heavy
  FROM public.system_events WHERE attempts >= 2 AND created_at > now() - interval '1 hour';

  -- Slow processing (pending > 10 min)
  SELECT count(*) INTO v_slow_events
  FROM public.system_events
  WHERE status = 'pending' AND created_at < now() - interval '10 minutes';

  -- Generate insights from patterns
  IF v_dead_count >= 3 THEN
    INSERT INTO public.ai_insights (title, description, insight_type, severity_score, classification_tier, recommended_action, accountable_entity, status)
    VALUES (
      'High Dead-Letter Event Frequency',
      v_dead_count || ' events dead-lettered in last hour. Possible systemic failure.',
      'anomaly', LEAST(90, 60 + v_dead_count * 5), 'high_risk',
      'Investigate event handlers and downstream dependencies',
      'event_processor', 'active'
    )
    ON CONFLICT DO NOTHING;
    v_insights_created := v_insights_created + 1;
  END IF;

  IF v_retry_heavy >= 5 THEN
    INSERT INTO public.ai_insights (title, description, insight_type, severity_score, classification_tier, recommended_action, accountable_entity, status)
    VALUES (
      'Excessive Event Retries Detected',
      v_retry_heavy || ' events with 2+ retries in last hour. System instability signal.',
      'anomaly', LEAST(80, 50 + v_retry_heavy * 3), 'suspicious',
      'Check handler logic and external service availability',
      'event_processor', 'active'
    )
    ON CONFLICT DO NOTHING;
    v_insights_created := v_insights_created + 1;
  END IF;

  IF v_slow_events >= 10 THEN
    INSERT INTO public.ai_insights (title, description, insight_type, severity_score, classification_tier, recommended_action, accountable_entity, status)
    VALUES (
      'Event Processing Delay Detected',
      v_slow_events || ' events pending > 10 min. Possible processor stall or overload.',
      'anomaly', LEAST(85, 55 + v_slow_events * 2), 'high_risk',
      'Check event processor health and system_control status',
      'event_processor', 'active'
    )
    ON CONFLICT DO NOTHING;
    v_insights_created := v_insights_created + 1;
  END IF;

  IF v_insights_created > 0 THEN
    PERFORM public.fn_emit_event('intelligence.feedback_generated', 'feedback_loop', 'system', null,
      jsonb_build_object('dead_letters', v_dead_count, 'retry_heavy', v_retry_heavy, 'slow', v_slow_events, 'insights', v_insights_created));
  END IF;

  RETURN jsonb_build_object(
    'dead_letter_count', v_dead_count,
    'retry_heavy_count', v_retry_heavy,
    'slow_event_count', v_slow_events,
    'insights_created', v_insights_created,
    'analyzed_at', now()
  );
END;
$$;

-- =============================================
-- CRON SCHEDULING
-- =============================================

-- Saga timeout sweep: every 2 min
SELECT cron.schedule('saga-timeout-sweep', '*/2 * * * *', $$SELECT public.fn_saga_timeout_sweep()$$);

-- Self-adaptation: every 15 min
SELECT cron.schedule('metrics-self-adapt-15m', '*/15 * * * *', $$SELECT public.fn_metrics_self_adapt()$$);

-- Intelligence feedback: every 10 min
SELECT cron.schedule('event-intelligence-feedback', '*/10 * * * *', $$SELECT public.fn_event_intelligence_feedback()$$);

-- Register heartbeats
INSERT INTO public.cron_heartbeats (job_name, last_run_at, max_delay_minutes, status)
VALUES
  ('saga-timeout-sweep', now(), 5, 'ok'),
  ('metrics-self-adapt-15m', now(), 20, 'ok'),
  ('event-intelligence-feedback', now(), 15, 'ok')
ON CONFLICT DO NOTHING;
