-- =========================================================
-- PHASE A: TENANT ISOLATION TRIGGER
-- =========================================================
CREATE OR REPLACE FUNCTION public.assert_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx_tenant TEXT;
BEGIN
  -- Block NULL tenant_id always
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT VIOLATION: tenant_id cannot be null';
  END IF;

  -- If session GUC is set, enforce match (otherwise allow — engine paths)
  v_ctx_tenant := current_setting('app.tenant_id', true);
  IF v_ctx_tenant IS NOT NULL AND v_ctx_tenant <> ''
     AND NEW.tenant_id::text <> v_ctx_tenant THEN
    RAISE EXCEPTION 'CROSS-TENANT WRITE BLOCKED: ctx=% row=%', v_ctx_tenant, NEW.tenant_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenant_isolation ON public.double_entry_ledger;
CREATE TRIGGER trg_tenant_isolation
BEFORE INSERT OR UPDATE ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.assert_tenant_isolation();

-- =========================================================
-- PHASE B: EVENT GATEWAY (single async entry point)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.financial_event_gateway (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_tenant ON public.financial_event_gateway(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gateway_status ON public.financial_event_gateway(status);
CREATE INDEX IF NOT EXISTS idx_gateway_created ON public.financial_event_gateway(created_at);

ALTER TABLE public.financial_event_gateway ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gateway_read_privileged" ON public.financial_event_gateway;
CREATE POLICY "gateway_read_privileged"
ON public.financial_event_gateway
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'treasurer'::app_role)
);

REVOKE INSERT, UPDATE, DELETE ON public.financial_event_gateway FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.financial_event_gateway FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.financial_event_gateway FROM anon;

-- Single allowed enqueue path
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
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;
  IF p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'event_type required';
  END IF;

  INSERT INTO public.financial_event_gateway (tenant_id, event_type, payload, created_by)
  VALUES (p_tenant_id, p_event_type, COALESCE(p_payload, '{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.enqueue_financial_event(UUID, TEXT, JSONB)
  TO authenticated, service_role;

-- Drain processor
CREATE OR REPLACE FUNCTION public.process_financial_event_gateway()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_ok INT := 0;
  v_failed INT := 0;
BEGIN
  FOR v_event IN
    SELECT * FROM public.financial_event_gateway
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.post_financial_event(
        v_event.tenant_id,
        v_event.event_type,
        COALESCE((v_event.payload->>'amount')::NUMERIC, 0),
        NULLIF(v_event.payload->>'reference_id', '')::UUID,
        COALESCE(v_event.payload->>'reference_type', v_event.event_type),
        v_event.payload->>'narration',
        v_event.created_by
      );

      UPDATE public.financial_event_gateway
      SET status = 'PROCESSED', processed_at = now()
      WHERE id = v_event.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.financial_event_gateway
      SET status = 'FAILED', error_message = SQLERRM, processed_at = now()
      WHERE id = v_event.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_ok,
    'failed', v_failed,
    'completed_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.process_financial_event_gateway()
  TO authenticated, service_role;

-- =========================================================
-- PHASE C: REPLAY ENGINE
-- =========================================================
ALTER TABLE public.financial_event_logs
  ADD COLUMN IF NOT EXISTS replayed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_event_logs_replay
  ON public.financial_event_logs(replayed) WHERE replayed = false;

CREATE OR REPLACE FUNCTION public.replay_financial_events(p_limit INT DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_ok INT := 0;
  v_failed INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.financial_event_logs
    WHERE replayed = false
      AND success = true
      AND tenant_id IS NOT NULL
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.post_financial_event(
        r.tenant_id,
        r.event_type,
        COALESCE((r.payload->>'amount')::NUMERIC, 0),
        r.reference_id,
        COALESCE(r.payload->>'reference_type', r.event_type),
        r.payload->>'narration',
        r.actor_user_id
      );
      UPDATE public.financial_event_logs SET replayed = true WHERE id = r.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'replayed', v_ok,
    'failed', v_failed,
    'completed_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.replay_financial_events(INT) TO service_role;

-- =========================================================
-- ENTERPRISE HEALTH (one-shot truth)
-- =========================================================
CREATE OR REPLACE FUNCTION public.enterprise_system_health()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger INT;
  v_gateway INT;
  v_pending INT;
  v_failed INT;
BEGIN
  SELECT COUNT(*) INTO v_ledger FROM public.double_entry_ledger;
  SELECT COUNT(*) INTO v_gateway FROM public.financial_event_gateway;
  SELECT COUNT(*) INTO v_pending FROM public.financial_event_gateway WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_failed FROM public.financial_event_gateway WHERE status = 'FAILED';

  RETURN jsonb_build_object(
    'ledger_rows', v_ledger,
    'gateway_rows', v_gateway,
    'pending_events', v_pending,
    'failed_events', v_failed,
    'status',
    CASE
      WHEN v_failed > 0 THEN 'DEGRADED'
      WHEN v_pending = 0 THEN 'FULLY_STABLE'
      ELSE 'PROCESSING'
    END,
    'checked_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.enterprise_system_health()
  TO authenticated, service_role;

-- Final check
SELECT public.enterprise_system_health();