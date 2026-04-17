-- ============================================================
-- STEP 2: CORE EXECUTION ENGINE
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
BEGIN
  -- Lock request row
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

  -- Get executor from registry
  SELECT executor_name INTO v_exec
  FROM public.execution_registry
  WHERE entity_type = v_req.entity_type
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No executor registered for %', v_req.entity_type;
  END IF;

  -- SAFE DISPATCH (NO dynamic SQL)
  CASE v_exec.executor_name
    WHEN 'execute_loan_disbursement' THEN
      PERFORM public.execute_loan_disbursement(p_request_id);
    WHEN 'execute_stub_not_ready' THEN
      PERFORM public.execute_stub_not_ready(p_request_id);
    ELSE
      RAISE EXCEPTION 'Unsupported executor: %', v_exec.executor_name;
  END CASE;

  -- Check if stub failed
  IF EXISTS (
    SELECT 1 FROM public.approval_requests
    WHERE id = p_request_id
      AND status = 'EXECUTION_FAILED'
  ) THEN
    RETURN jsonb_build_object(
      'status','NOT_IMPLEMENTED',
      'entity_type', v_req.entity_type
    );
  END IF;

  -- Success finalize
  UPDATE public.approval_requests
  SET status = 'EXECUTED',
      executed_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('status','EXECUTED');

EXCEPTION WHEN OTHERS THEN
  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = SQLERRM
  WHERE id = p_request_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.execution_engine_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v1(uuid) TO authenticated;