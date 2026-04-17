CREATE OR REPLACE FUNCTION public.execution_engine_v2(
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
  v_lock_active boolean;
BEGIN

  -- 1. IDEMPOTENCY LOCK WITH TTL (SELF-HEALING)
  -- Try to take or reclaim an expired lock atomically.
  WITH upsert AS (
    INSERT INTO public.execution_lock(request_id, expires_at)
    VALUES (p_request_id, now() + interval '10 minutes')
    ON CONFLICT (request_id) DO UPDATE
      SET expires_at = now() + interval '10 minutes'
      WHERE public.execution_lock.expires_at IS NOT NULL
        AND public.execution_lock.expires_at < now()
    RETURNING 1
  )
  SELECT NOT EXISTS (SELECT 1 FROM upsert) INTO v_lock_active;

  IF v_lock_active THEN
    RETURN jsonb_build_object('status','ALREADY_EXECUTED');
  END IF;

  -- 2. FETCH REQUEST (LOCKED)
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- 3. STATE VALIDATION
  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Invalid state: %', v_req.status;
  END IF;

  -- 4. PRIVILEGE CHECK
  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 5. REGISTRY LOOKUP
  SELECT executor_name INTO v_exec
  FROM public.execution_registry
  WHERE entity_type = v_req.entity_type
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No executor registered for %', v_req.entity_type;
  END IF;

  -- 6. CENTRALIZED EXECUTION ROUTER (SAFE DISPATCH)
  CASE v_exec.executor_name
    WHEN 'execute_loan_disbursement' THEN
      PERFORM public.execute_loan_disbursement(p_request_id);
    WHEN 'execute_stub_not_ready' THEN
      PERFORM public.execute_stub_not_ready(p_request_id);
    ELSE
      RAISE EXCEPTION 'Unsupported executor: %', v_exec.executor_name;
  END CASE;

  -- 7. STUB FAILURE CHECK
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE id = p_request_id
      AND status = 'EXECUTION_FAILED'
  ) THEN
    INSERT INTO public.execution_audit_log(
      request_id, entity_type, action_type, success, error_message
    ) VALUES (
      p_request_id, v_req.entity_type, 'NOT_IMPLEMENTED', false, 'stub_executed'
    );
    RETURN jsonb_build_object(
      'status','NOT_IMPLEMENTED',
      'entity_type', v_req.entity_type
    );
  END IF;

  -- 8. SUCCESS FINALIZATION
  UPDATE public.approval_requests
  SET status = 'EXECUTED',
      executed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.execution_audit_log(
    request_id, entity_type, action_type, success
  ) VALUES (
    p_request_id, v_req.entity_type, 'EXECUTED', true
  );

  RETURN jsonb_build_object('status','EXECUTED');

EXCEPTION WHEN OTHERS THEN
  -- 9. FAILURE HANDLER
  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = SQLERRM,
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.execution_audit_log(
    request_id, entity_type, action_type, success, error_message
  ) VALUES (
    p_request_id,
    COALESCE(v_req.entity_type,'unknown'),
    'FAILED',
    false,
    SQLERRM
  );

  RAISE;
END;
$$;

ALTER FUNCTION public.execution_engine_v2(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execution_engine_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v2(uuid) TO authenticated;