
-- Fix fn_system_health_status: moved_at → failed_at
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
    v_checks := v_checks || jsonb_build_object('module', 'sms_queue', 'status', 'warn', 'detail', format('High SMS queue lag: %s pending', v_sms_pending));
  ELSIF v_sms_pending > 20 THEN
    v_score := v_score - 5;
    v_checks := v_checks || jsonb_build_object('module', 'sms_queue', 'status', 'warn', 'detail', format('Moderate SMS queue: %s pending', v_sms_pending));
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'sms_queue', 'status', 'pass', 'detail', format('SMS queue healthy: %s pending', v_sms_pending));
  END IF;

  -- CHECK 2: SMS SLA
  IF v_sms_total > 0 AND v_sms_failed::numeric / v_sms_total > 0.05 THEN
    v_score := v_score - 20;
    v_checks := v_checks || jsonb_build_object('module', 'sms_sla', 'status', 'fail', 'detail', format('SMS failure rate: %s%%', round(v_sms_failed::numeric / v_sms_total * 100, 1)));
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'sms_sla', 'status', 'pass', 'detail', 'SMS SLA within threshold');
  END IF;

  -- CHECK 3: Ledger Reconciliation Freshness
  IF NOT EXISTS (
    SELECT 1 FROM public.cron_heartbeats
    WHERE job_name = 'daily-ledger-reconciliation'
    AND last_run_at > now() - interval '26 hours'
    AND status = 'success'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.cron_heartbeats WHERE job_name = 'daily-ledger-reconciliation') THEN
      v_score := v_score - 10;
      v_checks := v_checks || jsonb_build_object('module', 'ledger_recon', 'status', 'warn', 'detail', 'Ledger reconciliation overdue (>26h)');
    ELSE
      v_checks := v_checks || jsonb_build_object('module', 'ledger_recon', 'status', 'pass', 'detail', 'Ledger reconciliation: awaiting first run');
    END IF;
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'ledger_recon', 'status', 'pass', 'detail', 'Ledger reconciliation current');
  END IF;

  -- CHECK 4: Unresolved Ledger Mismatches
  IF EXISTS (SELECT 1 FROM public.ledger_mismatches WHERE status = 'detected' LIMIT 1) THEN
    v_score := v_score - 15;
    v_checks := v_checks || jsonb_build_object('module', 'ledger_mismatches', 'status', 'fail', 'detail', 'Unresolved ledger mismatches exist');
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'ledger_mismatches', 'status', 'pass', 'detail', 'No unresolved ledger mismatches');
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
    v_checks := v_checks || jsonb_build_object('module', 'cron_health', 'status', 'fail', 'detail', format('%s cron jobs stale or failed', v_failed_jobs));
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'cron_health', 'status', 'pass', 'detail', 'All cron jobs healthy');
  END IF;

  -- CHECK 6: Dead Letter Queue (FIXED: failed_at)
  IF EXISTS (
    SELECT 1 FROM public.sms_dead_letter
    WHERE failed_at > now() - interval '1 hour'
    LIMIT 1
  ) THEN
    v_score := v_score - 10;
    v_checks := v_checks || jsonb_build_object('module', 'dead_letter', 'status', 'warn', 'detail', 'Recent entries in SMS dead-letter queue');
  ELSE
    v_checks := v_checks || jsonb_build_object('module', 'dead_letter', 'status', 'pass', 'detail', 'Dead-letter queue clear');
  END IF;

  v_score := GREATEST(v_score, 0);
  IF v_score >= 90 THEN v_status := 'healthy';
  ELSIF v_score >= 70 THEN v_status := 'degraded';
  ELSE v_status := 'critical';
  END IF;

  RETURN jsonb_build_object('health_score', v_score, 'status', v_status, 'timestamp', now(), 'checks', v_checks);
END;
$$;

-- Fix fn_detect_financial_anomalies: moved_at → failed_at
CREATE OR REPLACE FUNCTION public.fn_detect_financial_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_avg_txn numeric;
  v_current_txn numeric;
  v_sms_fail_streak bigint;
  v_mismatch_recurrence bigint;
BEGIN
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
      'type', 'transaction_spike', 'severity', LEAST(90, 50 + ((v_current_txn / v_avg_txn - 2) * 20)::integer),
      'detail', format('Today: %s txns vs 7d avg: %s', v_current_txn, round(v_avg_txn, 0)), 'entity', 'financial_transactions'
    );
  END IF;

  -- FIXED: failed_at instead of moved_at
  SELECT count(*) INTO v_sms_fail_streak
  FROM public.sms_dead_letter
  WHERE failed_at > now() - interval '6 hours';

  IF v_sms_fail_streak >= 5 THEN
    v_results := v_results || jsonb_build_object(
      'type', 'sms_failure_pattern', 'severity', LEAST(85, 40 + (v_sms_fail_streak * 5)),
      'detail', format('%s SMS failures in last 6 hours', v_sms_fail_streak), 'entity', 'sms_delivery_queue'
    );
  END IF;

  SELECT count(*) INTO v_mismatch_recurrence
  FROM public.ledger_mismatches
  WHERE status = 'detected' AND detected_at > now() - interval '7 days';

  IF v_mismatch_recurrence >= 3 THEN
    v_results := v_results || jsonb_build_object(
      'type', 'ledger_variance_recurrence', 'severity', LEAST(95, 60 + (v_mismatch_recurrence * 10)),
      'detail', format('%s unresolved mismatches in 7 days', v_mismatch_recurrence), 'entity', 'double_entry_ledger'
    );
  END IF;

  IF jsonb_array_length(v_results) > 0 THEN
    INSERT INTO public.ai_insights (insight_type, title, description, severity_score, metadata)
    SELECT elem->>'type', 'Auto-detected: ' || (elem->>'type'), elem->>'detail', (elem->>'severity')::integer, elem
    FROM jsonb_array_elements(v_results) AS elem
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('anomalies_found', jsonb_array_length(v_results), 'results', v_results, 'scanned_at', now());
END;
$$;

-- Fix dead letter event trigger: recipient → recipient_phone
CREATE OR REPLACE FUNCTION public.trg_emit_sms_dead_letter_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_emit_event(
    'sms.dead_letter', 'sms_engine', 'sms', NEW.id::text,
    jsonb_build_object('recipient', NEW.recipient_phone, 'failure_reason', NEW.last_error)
  );
  RETURN NEW;
END;
$$;
