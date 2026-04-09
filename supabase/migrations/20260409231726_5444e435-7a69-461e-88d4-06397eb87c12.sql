
-- ═══════════════════════════════════════════════════
--  SMS Delivery Queue with Exponential Backoff
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sms_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recipient_phone text NOT NULL,
  message_body text NOT NULL,
  reference_type text DEFAULT 'general',
  reference_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  gateway_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX idx_sms_queue_status_retry ON public.sms_delivery_queue (status, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_sms_queue_tenant ON public.sms_delivery_queue (tenant_id, created_at DESC);

ALTER TABLE public.sms_delivery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_sms_queue" ON public.sms_delivery_queue
  FOR SELECT TO authenticated USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "block_anon_sms_queue" ON public.sms_delivery_queue
  FOR SELECT TO anon USING (false);

CREATE POLICY "service_role_all_sms_queue" ON public.sms_delivery_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "block_user_insert_sms_queue" ON public.sms_delivery_queue
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "block_user_update_sms_queue" ON public.sms_delivery_queue
  FOR UPDATE TO authenticated USING (false);

CREATE POLICY "block_user_delete_sms_queue" ON public.sms_delivery_queue
  FOR DELETE TO authenticated USING (false);

-- ═══════════════════════════════════════════════════
--  SMS Dead Letter Queue
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sms_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_queue_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recipient_phone text NOT NULL,
  message_body text NOT NULL,
  reference_type text,
  reference_id text,
  total_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  gateway_responses jsonb DEFAULT '[]'::jsonb,
  failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_dead_letter_tenant ON public.sms_dead_letter (tenant_id, failed_at DESC);

ALTER TABLE public.sms_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_dead_letter" ON public.sms_dead_letter
  FOR SELECT TO authenticated USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "block_anon_dead_letter" ON public.sms_dead_letter
  FOR SELECT TO anon USING (false);

CREATE POLICY "service_role_all_dead_letter" ON public.sms_dead_letter
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "block_user_modify_dead_letter" ON public.sms_dead_letter
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════════════════
--  fn_enqueue_sms — safe queue insertion
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_enqueue_sms(
  p_tenant_id uuid,
  p_phone text,
  p_body text,
  p_ref_type text DEFAULT 'general',
  p_ref_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO sms_delivery_queue (tenant_id, recipient_phone, message_body, reference_type, reference_id)
  VALUES (p_tenant_id, p_phone, p_body, p_ref_type, p_ref_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_process_sms_queue — exponential backoff retry
--  Backoff: attempt 1→1min, 2→5min, 3→15min, then dead-letter
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_process_sms_queue(p_batch_size integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_processed integer := 0;
  v_sent integer := 0;
  v_retried integer := 0;
  v_dead integer := 0;
  v_backoff_intervals interval[] := ARRAY['1 minute'::interval, '5 minutes'::interval, '15 minutes'::interval];
BEGIN
  -- Lock and fetch ready messages
  FOR v_row IN
    SELECT id, attempt_count, max_attempts, recipient_phone, message_body, tenant_id,
           reference_type, reference_id, gateway_response
    FROM sms_delivery_queue
    WHERE status IN ('pending', 'failed')
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed := v_processed + 1;

    -- Mark as processing
    UPDATE sms_delivery_queue SET status = 'processing', updated_at = now() WHERE id = v_row.id;

    -- Simulate send attempt (actual gateway call happens in edge function)
    -- This function prepares the queue state; edge function does HTTP call

    IF v_row.attempt_count + 1 >= v_row.max_attempts THEN
      -- Move to dead letter
      INSERT INTO sms_dead_letter (original_queue_id, tenant_id, recipient_phone, message_body,
                                    reference_type, reference_id, total_attempts, last_error, gateway_responses)
      VALUES (v_row.id, v_row.tenant_id, v_row.recipient_phone, v_row.message_body,
              v_row.reference_type, v_row.reference_id, v_row.attempt_count + 1,
              'Max retries exceeded', COALESCE(v_row.gateway_response, '{}'::jsonb));

      UPDATE sms_delivery_queue
      SET status = 'dead_letter', attempt_count = attempt_count + 1, updated_at = now()
      WHERE id = v_row.id;

      v_dead := v_dead + 1;
    ELSE
      -- Schedule retry with exponential backoff
      UPDATE sms_delivery_queue
      SET status = 'failed',
          attempt_count = attempt_count + 1,
          next_retry_at = now() + v_backoff_intervals[LEAST(v_row.attempt_count + 1, 3)],
          updated_at = now()
      WHERE id = v_row.id;

      v_retried := v_retried + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'sent', v_sent,
    'retried', v_retried,
    'moved_to_dead_letter', v_dead,
    'processed_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_mark_sms_sent — called by edge function after successful gateway response
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_mark_sms_sent(p_queue_id uuid, p_gateway_response jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sms_delivery_queue
  SET status = 'sent',
      sent_at = now(),
      gateway_response = p_gateway_response,
      updated_at = now()
  WHERE id = p_queue_id AND status = 'processing';
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_mark_sms_failed — called by edge function on gateway failure
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_mark_sms_failed(p_queue_id uuid, p_error text DEFAULT 'Unknown error')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_backoff_intervals interval[] := ARRAY['1 minute'::interval, '5 minutes'::interval, '15 minutes'::interval];
BEGIN
  SELECT attempt_count, max_attempts INTO v_row
  FROM sms_delivery_queue WHERE id = p_queue_id FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_row.attempt_count + 1 >= v_row.max_attempts THEN
    -- Move to dead letter
    INSERT INTO sms_dead_letter (original_queue_id, tenant_id, recipient_phone, message_body,
                                  reference_type, reference_id, total_attempts, last_error)
    SELECT p_queue_id, tenant_id, recipient_phone, message_body,
           reference_type, reference_id, attempt_count + 1, p_error
    FROM sms_delivery_queue WHERE id = p_queue_id;

    UPDATE sms_delivery_queue
    SET status = 'dead_letter', attempt_count = attempt_count + 1, last_error = p_error, updated_at = now()
    WHERE id = p_queue_id;
  ELSE
    UPDATE sms_delivery_queue
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = p_error,
        next_retry_at = now() + v_backoff_intervals[LEAST(v_row.attempt_count + 1, 3)],
        updated_at = now()
    WHERE id = p_queue_id;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_check_sms_sla — monitors delivery success rate
--  Returns alert if success rate drops below 95%
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_check_sms_sla(p_window_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_sent integer;
  v_failed integer;
  v_dead integer;
  v_success_rate numeric;
  v_status text;
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - (p_window_hours || ' hours')::interval;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'sent'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'dead_letter')
  INTO v_total, v_sent, v_failed, v_dead
  FROM sms_delivery_queue
  WHERE created_at >= v_cutoff;

  IF v_total = 0 THEN
    v_success_rate := 100;
    v_status := 'healthy';
  ELSE
    v_success_rate := round((v_sent::numeric / v_total) * 100, 2);
    IF v_success_rate >= 95 THEN
      v_status := 'healthy';
    ELSIF v_success_rate >= 85 THEN
      v_status := 'warning';
    ELSE
      v_status := 'critical';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'window_hours', p_window_hours,
    'total_messages', v_total,
    'sent', v_sent,
    'failed', v_failed,
    'dead_letter', v_dead,
    'success_rate_pct', v_success_rate,
    'threshold_pct', 95,
    'checked_at', now()
  );
END;
$$;

COMMENT ON TABLE public.sms_delivery_queue IS 'Production SMS queue with exponential backoff retry (1m→5m→15m)';
COMMENT ON TABLE public.sms_dead_letter IS 'Permanently failed SMS messages after max retry attempts';
COMMENT ON FUNCTION public.fn_check_sms_sla IS 'SLA monitor: alerts when SMS delivery rate drops below 95%';
