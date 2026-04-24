-- =========================================================
-- GAP 1: BACKGROUND WORKER (AUTONOMOUS PROCESSOR)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.financial_event_worker_state (
  id INT PRIMARY KEY DEFAULT 1,
  is_running BOOLEAN DEFAULT false,
  last_run TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.financial_event_worker_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_state_read_authenticated" ON public.financial_event_worker_state;
CREATE POLICY "worker_state_read_authenticated"
ON public.financial_event_worker_state
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.financial_event_worker_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Ensure gateway has columns the worker writes to
ALTER TABLE public.financial_event_gateway
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- SAFE CONTINUOUS WORKER (idempotent + lock protected)
CREATE OR REPLACE FUNCTION public.run_financial_event_worker()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock BOOLEAN;
  v_processed INT := 0;
  v_failed INT := 0;
  v_event RECORD;
BEGIN
  -- prevent parallel execution
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
      SET status = 'PROCESSED',
          processed_at = now()
      WHERE id = v_event.id;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.financial_event_gateway
      SET status = 'FAILED',
          error_message = SQLERRM,
          processed_at = now()
      WHERE id = v_event.id;

      v_failed := v_failed + 1;
    END;
  END LOOP;

  UPDATE public.financial_event_worker_state
  SET is_running = false, updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed', v_failed,
    'status', 'COMPLETED'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.run_financial_event_worker()
TO service_role;


-- =========================================================
-- GAP 2: STRICT EVENT SCHEMA VALIDATION LAYER
-- =========================================================

CREATE OR REPLACE FUNCTION public.validate_event_payload(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'EVENT PAYLOAD REQUIRED';
  END IF;

  IF p_payload ? 'amount' THEN
    IF (p_payload->>'amount')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'INVALID AMOUNT';
    END IF;
  END IF;

  IF p_payload ? 'reference_id' THEN
    IF p_payload->>'reference_id' = '' THEN
      RAISE EXCEPTION 'INVALID REFERENCE_ID';
    END IF;
  END IF;
END $$;


-- enforce validation at enqueue level
CREATE OR REPLACE FUNCTION public.enqueue_financial_event(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM public.validate_event_payload(p_event_type, p_payload);

  INSERT INTO public.financial_event_gateway (
    tenant_id,
    event_type,
    payload,
    created_by
  )
  VALUES (
    p_tenant_id,
    p_event_type,
    COALESCE(p_payload, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;


-- =========================================================
-- FINAL AUTONOMY HEALTH CHECK
-- =========================================================

CREATE OR REPLACE FUNCTION public.financial_autonomy_health()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pending INT;
  v_failed INT;
  v_running BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_pending
  FROM public.financial_event_gateway
  WHERE status = 'PENDING';

  SELECT COUNT(*) INTO v_failed
  FROM public.financial_event_gateway
  WHERE status = 'FAILED';

  SELECT is_running INTO v_running
  FROM public.financial_event_worker_state
  WHERE id = 1;

  RETURN jsonb_build_object(
    'pending_events', v_pending,
    'failed_events', v_failed,
    'worker_running', v_running,
    'status',
    CASE
      WHEN v_failed > 0 THEN 'DEGRADED'
      WHEN v_pending = 0 THEN 'AUTONOMOUS_CLEAN'
      ELSE 'PROCESSING'
    END,
    'checked_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.financial_autonomy_health()
TO authenticated, service_role;