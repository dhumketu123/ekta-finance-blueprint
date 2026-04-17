BEGIN;

-- ============================================================
-- 1. EXECUTION REGISTRY (SCALABLE ENTITY MAPPING LAYER)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.execution_registry (
  entity_type TEXT PRIMARY KEY,
  executor_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  permission_role TEXT DEFAULT 'authenticated',
  version TEXT DEFAULT 'v1',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.execution_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Privileged users can view execution registry" ON public.execution_registry;
CREATE POLICY "Privileged users can view execution registry"
ON public.execution_registry
FOR SELECT
TO authenticated
USING (public.is_privileged_user());

INSERT INTO public.execution_registry(entity_type, executor_name, permission_role)
VALUES
('loan_disbursement', 'execute_loan_disbursement', 'finance_admin'),
('loan_reschedule', 'execute_stub_not_ready', 'finance_admin'),
('early_settlement', 'execute_stub_not_ready', 'finance_admin'),
('profit_distribution', 'execute_stub_not_ready', 'accountant'),
('owner_exit', 'execute_stub_not_ready', 'super_admin'),
('journal_adjustment', 'execute_stub_not_ready', 'accountant')
ON CONFLICT (entity_type) DO NOTHING;

-- ============================================================
-- 2. SAFE STUB EXECUTOR (CONTROLLED FAILURE, NO CRASH)
-- ============================================================

CREATE OR REPLACE FUNCTION public.execute_stub_not_ready(
  p_request_id uuid,
  p_entity_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = format('NOT_IMPLEMENTED:%s', p_entity_type),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.approval_execution_logs(request_id, success, error_message)
  VALUES (
    p_request_id,
    false,
    format('Stub not implemented: %s', p_entity_type)
  );

  INSERT INTO public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    user_id,
    details
  )
  VALUES (
    'approval_execution_not_ready',
    p_entity_type,
    p_request_id,
    auth.uid(),
    jsonb_build_object('status', 'NOT_IMPLEMENTED')
  );

END;
$$;

-- ============================================================
-- 3. CORE EXECUTION ENGINE (REGISTRY DRIVEN ROUTER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.execution_engine_v1(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_exec record;
  v_status text;
  v_user_id uuid := auth.uid();
BEGIN

  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Not approved (current status: %)', v_req.status;
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_exec
  FROM public.execution_registry
  WHERE entity_type = v_req.entity_type
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No executor registered for %', v_req.entity_type;
  END IF;

  -- Dynamic dispatch — stub takes 2 args, real executors take 1
  IF v_exec.executor_name = 'execute_stub_not_ready' THEN
    EXECUTE format('SELECT public.%I($1,$2)', v_exec.executor_name)
    USING p_request_id, v_req.entity_type;
  ELSE
    EXECUTE format('SELECT public.%I($1)', v_exec.executor_name)
    USING p_request_id;
  END IF;

  SELECT status INTO v_status
  FROM public.approval_requests
  WHERE id = p_request_id;

  IF v_status = 'EXECUTION_FAILED' THEN

    INSERT INTO public.audit_logs(
      action_type,
      entity_type,
      entity_id,
      user_id,
      details
    )
    VALUES (
      'approval_execution_not_ready',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object('reason', 'stub_not_implemented')
    );

    RETURN jsonb_build_object(
      'status', 'NOT_IMPLEMENTED',
      'entity_type', v_req.entity_type
    );
  END IF;

  UPDATE public.approval_requests
  SET status = 'EXECUTED',
      executed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    user_id,
    details
  )
  VALUES (
    'approval_executed',
    v_req.entity_type,
    p_request_id,
    v_user_id,
    jsonb_build_object(
      'amount', v_req.amount,
      'entity_id', v_req.entity_id
    )
  );

  RETURN jsonb_build_object('status', 'EXECUTED');

EXCEPTION WHEN OTHERS THEN

  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = SQLERRM,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.approval_execution_logs(
    request_id,
    success,
    error_message
  )
  VALUES (
    p_request_id,
    false,
    SQLERRM
  );

  INSERT INTO public.audit_logs(
    action_type,
    entity_type,
    entity_id,
    user_id,
    details
  )
  VALUES (
    'approval_execution_failed',
    COALESCE(v_req.entity_type, 'unknown'),
    p_request_id,
    v_user_id,
    jsonb_build_object('error', SQLERRM)
  );

  RAISE;

END;
$$;

-- ============================================================
-- 4. SECURITY GRANTS
-- ============================================================

REVOKE ALL ON FUNCTION public.execution_engine_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_stub_not_ready(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_stub_not_ready(uuid, text) TO authenticated;

COMMIT;