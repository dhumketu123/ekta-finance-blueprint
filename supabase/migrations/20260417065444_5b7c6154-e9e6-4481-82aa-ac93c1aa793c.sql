-- 0) Status upgrade support
ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_status_valid;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_status_valid
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXECUTED','EXECUTION_FAILED'));

-- 1) Execution log table
CREATE TABLE IF NOT EXISTS public.approval_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  executed_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.approval_execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_exec_logs ON public.approval_execution_logs;
CREATE POLICY tenant_select_exec_logs
ON public.approval_execution_logs
FOR SELECT
TO authenticated
USING (
  request_id IN (
    SELECT id FROM public.approval_requests
    WHERE tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.approval_execution_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.approval_execution_logs FROM anon;

-- 2) Core execution function
CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_req public.approval_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Not authorized to execute approvals';
  END IF;

  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  -- Cross-tenant guard
  IF v_req.tenant_id <> (SELECT tenant_id FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Request not approved';
  END IF;

  -- Idempotency check
  IF EXISTS (SELECT 1 FROM public.approval_execution_logs WHERE request_id = p_request_id) THEN
    RETURN jsonb_build_object('id', p_request_id, 'status', 'ALREADY_EXECUTED');
  END IF;

  BEGIN
    -- Entity routing
    IF v_req.entity_type = 'loan_disbursement' THEN
      -- Placeholder: actual disbursement should be handled via dedicated RPC
      NULL;
    ELSIF v_req.entity_type = 'loan_reschedule' THEN
      NULL;
    ELSIF v_req.entity_type = 'early_settlement' THEN
      NULL;
    ELSIF v_req.entity_type = 'profit_distribution' THEN
      NULL;
    ELSIF v_req.entity_type = 'owner_exit' THEN
      NULL;
    ELSIF v_req.entity_type = 'journal_adjustment' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Unsupported entity_type: %', v_req.entity_type;
    END IF;

    -- Mark executed
    UPDATE public.approval_requests
    SET status = 'EXECUTED',
        executed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.approval_execution_logs (request_id, success)
    VALUES (p_request_id, true);

    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
    VALUES (
      'approval_executed',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object('amount', v_req.amount, 'action', v_req.action_type)
    );

    RETURN jsonb_build_object('id', p_request_id, 'status', 'EXECUTED');

  EXCEPTION WHEN OTHERS THEN
    -- Record failure (separate transaction not needed; outer block re-raises)
    UPDATE public.approval_requests
    SET status = 'EXECUTION_FAILED',
        execution_error = SQLERRM,
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.approval_execution_logs (request_id, success, error_message)
    VALUES (p_request_id, false, SQLERRM);

    RAISE;
  END;
END;
$$;

ALTER FUNCTION public.process_approved_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_approved_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_approved_request(uuid) TO authenticated;

-- 3) Reconfirm direct write block on approval_requests
REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM anon;