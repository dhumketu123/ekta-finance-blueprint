CREATE OR REPLACE FUNCTION public.execution_engine_v3(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_exec record;
BEGIN
  -- 1. FETCH REQUEST
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- 2. VALIDATION
  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Invalid state: %', v_req.status;
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. LOCK CHECK (idempotency guard with TTL)
  IF EXISTS (
    SELECT 1 FROM public.execution_lock
    WHERE request_id = p_request_id
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN jsonb_build_object('status','ALREADY_EXECUTED');
  END IF;

  INSERT INTO public.execution_lock(request_id, expires_at)
  VALUES (p_request_id, now() + interval '10 minutes')
  ON CONFLICT (request_id) DO UPDATE
    SET expires_at = now() + interval '10 minutes';

  -- 4. REGISTRY LOOKUP
  SELECT executor_name INTO v_exec
  FROM public.execution_registry
  WHERE entity_type = v_req.entity_type
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No executor registered for %', v_req.entity_type;
  END IF;

  -- 5. DISPATCH (SAFE SWITCH ONLY)
  CASE v_exec.executor_name
    WHEN 'execute_loan_disbursement' THEN
      PERFORM public.execute_loan_disbursement(p_request_id);

    WHEN 'execute_stub_not_ready' THEN
      PERFORM public.execute_stub_not_ready(p_request_id, v_req.entity_type);

    ELSE
      RAISE EXCEPTION 'Unsupported executor: %', v_exec.executor_name;
  END CASE;

  -- 6. RESULT CHECK
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE id = p_request_id
      AND status = 'EXECUTION_FAILED'
  ) THEN
    PERFORM public.write_execution_audit(
      p_request_id,
      v_req.entity_type,
      'NOT_IMPLEMENTED',
      false,
      'stub_not_ready'
    );

    RETURN jsonb_build_object(
      'status','NOT_IMPLEMENTED',
      'entity_type', v_req.entity_type
    );
  END IF;

  -- 7. SUCCESS FINALIZATION
  UPDATE public.approval_requests
  SET status = 'EXECUTED',
      executed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  PERFORM public.write_execution_audit(
    p_request_id,
    v_req.entity_type,
    'EXECUTED',
    true,
    NULL
  );

  RETURN jsonb_build_object('status','EXECUTED');

EXCEPTION WHEN OTHERS THEN
  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = SQLERRM,
      updated_at = now()
  WHERE id = p_request_id;

  PERFORM public.write_execution_audit(
    p_request_id,
    COALESCE(v_req.entity_type,'unknown'),
    'FAILED',
    false,
    SQLERRM
  );

  RAISE;
END;
$$;

ALTER FUNCTION public.execution_engine_v3(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execution_engine_v3(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v3(uuid) TO authenticated;