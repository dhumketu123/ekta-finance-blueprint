
-- ============================================================
-- MODULE A: SYSTEM HEARTBEAT MONITOR
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  max_delay_minutes integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_heartbeats_job ON public.cron_heartbeats (job_name, last_run_at DESC);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on cron_heartbeats"
  ON public.cron_heartbeats FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin read cron_heartbeats"
  ON public.cron_heartbeats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Record heartbeat RPC
CREATE OR REPLACE FUNCTION public.fn_record_heartbeat(
  p_job_name text,
  p_status text DEFAULT 'success',
  p_duration_ms integer DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cron_heartbeats (job_name, last_run_at, duration_ms, status, error_message, max_delay_minutes)
  VALUES (
    p_job_name,
    now(),
    p_duration_ms,
    p_status,
    p_error_message,
    CASE
      WHEN p_job_name LIKE 'sms-%' THEN 5
      WHEN p_job_name LIKE 'ledger-%' THEN 1440
      WHEN p_job_name LIKE 'daily-%' THEN 1440
      ELSE 60
    END
  );
END;
$$;

-- System Health Score RPC (0–100)
CREATE OR REPLACE FUNCTION public.fn_system_health_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 100;
  v_checks jsonb := '[]'::jsonb;
  v_sms_pending bigint;
  v_sms_failed bigint;
  v_sms_total bigint;
  v_ledger_last timestamptz;
  v_stale_jobs jsonb;
  v_failed_jobs bigint;
  v_status text;
BEGIN
  -- CHECK 1: SMS Queue Lag
  SELECT
    count(*) FILTER (WHERE status IN ('pending', 'retrying')),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO v_sms_pending, v_sms_failed, v_sms_total
  FROM public.sms_delivery_queue
  WHERE created_at > now() - interval '1 hour';

  IF v_sms_pending > 50 THEN
    v_score := v_score - 15;
    v_checks := v_checks || jsonb_build_object(
      'module', 'sms_queue', 'status', 'warn',
      'detail', format('High SMS queue lag: %s pending', v_sms_pending)
    );
  ELSIF v_sms_pending > 20 THEN
    v_score := v_score - 5;
    v_checks := v_checks || jsonb_build_object(
      'module', 'sms_queue', 'status', 'warn',
      'detail', format('Moderate SMS queue: %s pending', v_sms_pending)
    );
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'sms_queue', 'status', 'pass',
      'detail', format('SMS queue healthy: %s pending', v_sms_pending)
    );
  END IF;

  -- CHECK 2: SMS SLA
  IF v_sms_total > 0 AND v_sms_failed::numeric / v_sms_total > 0.05 THEN
    v_score := v_score - 20;
    v_checks := v_checks || jsonb_build_object(
      'module', 'sms_sla', 'status', 'fail',
      'detail', format('SMS failure rate: %s%%', round(v_sms_failed::numeric / v_sms_total * 100, 1))
    );
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'sms_sla', 'status', 'pass',
      'detail', 'SMS SLA within threshold'
    );
  END IF;

  -- CHECK 3: Ledger Reconciliation Freshness
  SELECT max(detected_at) INTO v_ledger_last
  FROM public.ledger_mismatches;

  -- Check if reconciliation ran recently (via heartbeat)
  IF NOT EXISTS (
    SELECT 1 FROM public.cron_heartbeats
    WHERE job_name = 'daily-ledger-reconciliation'
    AND last_run_at > now() - interval '26 hours'
    AND status = 'success'
  ) THEN
    -- Only penalize if there are no heartbeats at all (new system) after giving 48h grace
    IF EXISTS (SELECT 1 FROM public.cron_heartbeats WHERE job_name = 'daily-ledger-reconciliation') THEN
      v_score := v_score - 10;
      v_checks := v_checks || jsonb_build_object(
        'module', 'ledger_recon', 'status', 'warn',
        'detail', 'Ledger reconciliation overdue (>26h)'
      );
    ELSE
      v_checks := v_checks || jsonb_build_object(
        'module', 'ledger_recon', 'status', 'pass',
        'detail', 'Ledger reconciliation: awaiting first run'
      );
    END IF;
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'ledger_recon', 'status', 'pass',
      'detail', 'Ledger reconciliation current'
    );
  END IF;

  -- CHECK 4: Unresolved Ledger Mismatches
  IF EXISTS (SELECT 1 FROM public.ledger_mismatches WHERE status = 'detected' LIMIT 1) THEN
    v_score := v_score - 15;
    v_checks := v_checks || jsonb_build_object(
      'module', 'ledger_mismatches', 'status', 'fail',
      'detail', 'Unresolved ledger mismatches exist'
    );
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'ledger_mismatches', 'status', 'pass',
      'detail', 'No unresolved ledger mismatches'
    );
  END IF;

  -- CHECK 5: Stale Cron Jobs
  SELECT count(*) INTO v_failed_jobs
  FROM (
    SELECT DISTINCT ON (job_name) job_name, last_run_at, max_delay_minutes, status
    FROM public.cron_heartbeats
    ORDER BY job_name, last_run_at DESC
  ) latest
  WHERE latest.last_run_at < now() - (latest.max_delay_minutes || ' minutes')::interval
     OR latest.status = 'failed';

  IF v_failed_jobs > 0 THEN
    v_score := v_score - (v_failed_jobs::integer * 10);
    v_checks := v_checks || jsonb_build_object(
      'module', 'cron_health', 'status', 'fail',
      'detail', format('%s cron jobs stale or failed', v_failed_jobs)
    );
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'cron_health', 'status', 'pass',
      'detail', 'All cron jobs healthy'
    );
  END IF;

  -- CHECK 6: Dead Letter Queue
  IF EXISTS (
    SELECT 1 FROM public.sms_dead_letter
    WHERE moved_at > now() - interval '1 hour'
    LIMIT 1
  ) THEN
    v_score := v_score - 10;
    v_checks := v_checks || jsonb_build_object(
      'module', 'dead_letter', 'status', 'warn',
      'detail', 'Recent entries in SMS dead-letter queue'
    );
  ELSE
    v_checks := v_checks || jsonb_build_object(
      'module', 'dead_letter', 'status', 'pass',
      'detail', 'Dead-letter queue clear'
    );
  END IF;

  -- Compute final status
  v_score := GREATEST(v_score, 0);
  IF v_score >= 90 THEN v_status := 'healthy';
  ELSIF v_score >= 70 THEN v_status := 'degraded';
  ELSE v_status := 'critical';
  END IF;

  RETURN jsonb_build_object(
    'health_score', v_score,
    'status', v_status,
    'timestamp', now(),
    'checks', v_checks
  );
END;
$$;


-- ============================================================
-- MODULE B: ANOMALY INTELLIGENCE ENGINE
-- ============================================================

-- Enhance ai_insights with classification tier
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_insights' AND column_name = 'classification_tier') THEN
    ALTER TABLE public.ai_insights ADD COLUMN classification_tier text NOT NULL DEFAULT 'info';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_insights' AND column_name = 'impact_estimate') THEN
    ALTER TABLE public.ai_insights ADD COLUMN impact_estimate text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_insights' AND column_name = 'accountable_entity') THEN
    ALTER TABLE public.ai_insights ADD COLUMN accountable_entity text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_insights' AND column_name = 'recommended_action') THEN
    ALTER TABLE public.ai_insights ADD COLUMN recommended_action text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_insights' AND column_name = 'auto_escalated') THEN
    ALTER TABLE public.ai_insights ADD COLUMN auto_escalated boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_insights_tier ON public.ai_insights (classification_tier, created_at DESC);

-- Auto-classify anomaly based on severity
CREATE OR REPLACE FUNCTION public.fn_classify_anomaly()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tier classification
  IF NEW.severity_score >= 90 THEN
    NEW.classification_tier := 'freeze_required';
    NEW.recommended_action := COALESCE(NEW.recommended_action, 'Immediate freeze and manual review required');
    NEW.impact_estimate := COALESCE(NEW.impact_estimate, 'Critical — potential financial loss');
  ELSIF NEW.severity_score >= 70 THEN
    NEW.classification_tier := 'high_risk';
    NEW.recommended_action := COALESCE(NEW.recommended_action, 'Escalate to admin for immediate review');
    NEW.impact_estimate := COALESCE(NEW.impact_estimate, 'High — requires urgent attention');
  ELSIF NEW.severity_score >= 40 THEN
    NEW.classification_tier := 'suspicious';
    NEW.recommended_action := COALESCE(NEW.recommended_action, 'Flag for monitoring and follow-up');
    NEW.impact_estimate := COALESCE(NEW.impact_estimate, 'Medium — monitor closely');
  ELSE
    NEW.classification_tier := 'info';
    NEW.recommended_action := COALESCE(NEW.recommended_action, 'Log for record keeping');
    NEW.impact_estimate := COALESCE(NEW.impact_estimate, 'Low — informational');
  END IF;

  -- Auto-escalation for freeze_required
  IF NEW.classification_tier = 'freeze_required' AND NOT NEW.auto_escalated THEN
    NEW.auto_escalated := true;
    -- Emit event for cross-system awareness (will be picked up by event layer)
    PERFORM pg_notify('system_events', json_build_object(
      'event_type', 'anomaly.freeze_required',
      'entity_id', NEW.id,
      'severity', NEW.severity_score,
      'title', NEW.title
    )::text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_anomaly ON public.ai_insights;
CREATE TRIGGER trg_classify_anomaly
  BEFORE INSERT OR UPDATE OF severity_score ON public.ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_classify_anomaly();

-- Financial anomaly detection scanner
CREATE OR REPLACE FUNCTION public.fn_detect_financial_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_spike_count bigint;
  v_avg_txn numeric;
  v_current_txn numeric;
  v_sms_fail_streak bigint;
  v_mismatch_recurrence bigint;
BEGIN
  -- DETECT 1: Transaction volume spike (2x of 7-day average)
  SELECT COALESCE(avg(daily_count), 0) INTO v_avg_txn
  FROM (
    SELECT date(created_at) as dt, count(*) as daily_count
    FROM public.financial_transactions
    WHERE created_at > now() - interval '7 days'
    GROUP BY date(created_at)
  ) daily;

  SELECT count(*) INTO v_current_txn
  FROM public.financial_transactions
  WHERE created_at > now() - interval '1 day';

  IF v_avg_txn > 0 AND v_current_txn > v_avg_txn * 2 THEN
    v_results := v_results || jsonb_build_object(
      'type', 'transaction_spike',
      'severity', LEAST(90, 50 + ((v_current_txn / v_avg_txn - 2) * 20)::integer),
      'detail', format('Today: %s txns vs 7d avg: %s', v_current_txn, round(v_avg_txn, 0)),
      'entity', 'financial_transactions'
    );
  END IF;

  -- DETECT 2: SMS failure pattern (>5 consecutive failures)
  SELECT count(*) INTO v_sms_fail_streak
  FROM public.sms_dead_letter
  WHERE moved_at > now() - interval '6 hours';

  IF v_sms_fail_streak >= 5 THEN
    v_results := v_results || jsonb_build_object(
      'type', 'sms_failure_pattern',
      'severity', LEAST(85, 40 + (v_sms_fail_streak * 5)),
      'detail', format('%s SMS failures in last 6 hours', v_sms_fail_streak),
      'entity', 'sms_delivery_queue'
    );
  END IF;

  -- DETECT 3: Ledger variance recurrence
  SELECT count(*) INTO v_mismatch_recurrence
  FROM public.ledger_mismatches
  WHERE status = 'detected'
  AND detected_at > now() - interval '7 days';

  IF v_mismatch_recurrence >= 3 THEN
    v_results := v_results || jsonb_build_object(
      'type', 'ledger_variance_recurrence',
      'severity', LEAST(95, 60 + (v_mismatch_recurrence * 10)),
      'detail', format('%s unresolved mismatches in 7 days', v_mismatch_recurrence),
      'entity', 'double_entry_ledger'
    );
  END IF;

  -- Auto-insert detected anomalies into ai_insights
  IF jsonb_array_length(v_results) > 0 THEN
    INSERT INTO public.ai_insights (insight_type, title, description, severity_score, metadata)
    SELECT
      elem->>'type',
      'Auto-detected: ' || (elem->>'type'),
      elem->>'detail',
      (elem->>'severity')::integer,
      elem
    FROM jsonb_array_elements(v_results) AS elem
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'anomalies_found', jsonb_array_length(v_results),
    'results', v_results,
    'scanned_at', now()
  );
END;
$$;


-- ============================================================
-- MODULE C: EVENT STREAM LAYER (BRIDGE CORE)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  source_module text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid DEFAULT gen_random_uuid(),
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_events_type ON public.system_events (event_type, created_at DESC);
CREATE INDEX idx_system_events_unprocessed ON public.system_events (processed, created_at) WHERE NOT processed;
CREATE INDEX idx_system_events_correlation ON public.system_events (correlation_id);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on system_events"
  ON public.system_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin read system_events"
  ON public.system_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_events;

-- Standardized event emitter
CREATE OR REPLACE FUNCTION public.fn_emit_event(
  p_event_type text,
  p_source_module text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_correlation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.system_events (event_type, source_module, entity_type, entity_id, payload, correlation_id)
  VALUES (p_event_type, p_source_module, p_entity_type, p_entity_id, p_payload, COALESCE(p_correlation_id, gen_random_uuid()))
  RETURNING id INTO v_event_id;

  -- Notify listeners
  PERFORM pg_notify('system_events', json_build_object(
    'id', v_event_id,
    'event_type', p_event_type,
    'source', p_source_module
  )::text);

  RETURN v_event_id;
END;
$$;

-- Event replay function
CREATE OR REPLACE FUNCTION public.fn_replay_events(
  p_event_type text DEFAULT NULL,
  p_from timestamptz DEFAULT now() - interval '24 hours',
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.system_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.system_events
  WHERE (p_event_type IS NULL OR event_type = p_event_type)
    AND created_at BETWEEN p_from AND p_to
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

-- Event aggregation (hourly counts)
CREATE OR REPLACE FUNCTION public.fn_event_aggregation(
  p_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(agg)), '[]'::jsonb)
    FROM (
      SELECT
        event_type,
        date_trunc('hour', created_at) as hour,
        count(*) as event_count
      FROM public.system_events
      WHERE created_at > now() - (p_hours || ' hours')::interval
      GROUP BY event_type, date_trunc('hour', created_at)
      ORDER BY hour DESC
    ) agg
  );
END;
$$;

-- ============================================================
-- AUTO-EMIT TRIGGERS (Cross-module bridges)
-- ============================================================

-- Bridge: SMS Dead Letter → Event
CREATE OR REPLACE FUNCTION public.trg_emit_sms_dead_letter_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_emit_event(
    'sms.dead_letter',
    'sms_engine',
    'sms',
    NEW.id::text,
    jsonb_build_object('recipient', NEW.recipient, 'failure_reason', NEW.last_error)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_dead_letter_event ON public.sms_dead_letter;
CREATE TRIGGER trg_sms_dead_letter_event
  AFTER INSERT ON public.sms_dead_letter
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_emit_sms_dead_letter_event();

-- Bridge: Ledger Mismatch → Event
CREATE OR REPLACE FUNCTION public.trg_emit_ledger_mismatch_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_emit_event(
    'ledger.mismatch_detected',
    'ledger_engine',
    'ledger',
    NEW.id::text,
    jsonb_build_object('reference_type', NEW.reference_type, 'variance', NEW.total_debit - NEW.total_credit)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_mismatch_event ON public.ledger_mismatches;
CREATE TRIGGER trg_ledger_mismatch_event
  AFTER INSERT ON public.ledger_mismatches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_emit_ledger_mismatch_event();

-- Bridge: Anomaly freeze_required → Event + Notification
CREATE OR REPLACE FUNCTION public.trg_emit_anomaly_escalation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.classification_tier = 'freeze_required' AND NEW.auto_escalated = true
     AND (OLD IS NULL OR OLD.auto_escalated = false) THEN
    PERFORM public.fn_emit_event(
      'anomaly.freeze_required',
      'anomaly_engine',
      'ai_insights',
      NEW.id::text,
      jsonb_build_object('severity', NEW.severity_score, 'title', NEW.title)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anomaly_escalation_event ON public.ai_insights;
CREATE TRIGGER trg_anomaly_escalation_event
  AFTER INSERT OR UPDATE ON public.ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_emit_anomaly_escalation_event();
