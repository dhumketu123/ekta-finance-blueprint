-- 1) FULL TRANSACTION SAFETY WRAPPER
CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req record;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- HARD LOCK (no SKIP LOCKED)
  SELECT *
  INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Not approved';
  END IF;

  -- STRICT IDENTITY IDEMPOTENCY (ATOMIC CHECK)
  PERFORM 1
  FROM public.approval_execution_logs
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('status','ALREADY_EXECUTED');
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  BEGIN
    -- ROUTER
    CASE v_req.entity_type
      WHEN 'loan_disbursement' THEN
        PERFORM public.execute_loan_disbursement(p_request_id);
      ELSE
        RAISE EXCEPTION 'Unsupported entity';
    END CASE;

    -- FINAL STATE UPDATE (SAFE ORDERING)
    INSERT INTO public.approval_execution_logs(request_id, success)
    VALUES (p_request_id, true);

    UPDATE public.approval_requests
    SET status = 'EXECUTED',
        executed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs(
      action_type, entity_type, entity_id, user_id, details
    ) VALUES (
      'approval_executed',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object('amount', v_req.amount)
    );

    RETURN jsonb_build_object('status','EXECUTED');

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.approval_requests
    SET status = 'EXECUTION_FAILED',
        execution_error = SQLERRM,
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.approval_execution_logs(request_id, success, error_message)
    VALUES (p_request_id, false, SQLERRM);

    RAISE;
  END;
END;
$$;

ALTER FUNCTION public.process_approved_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_approved_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_approved_request(uuid) TO authenticated;

-- 2) STRONG IDENTITY CONSTRAINT
ALTER TABLE public.approval_execution_logs
DROP CONSTRAINT IF EXISTS unique_request_exec;

ALTER TABLE public.approval_execution_logs
ADD CONSTRAINT unique_request_exec UNIQUE (request_id);

-- 3) LOAN STATE GUARD
ALTER TABLE public.loans
DROP CONSTRAINT IF EXISTS valid_status_transition;

ALTER TABLE public.loans
ADD CONSTRAINT valid_status_transition
CHECK (status IN ('active','closed','default'));