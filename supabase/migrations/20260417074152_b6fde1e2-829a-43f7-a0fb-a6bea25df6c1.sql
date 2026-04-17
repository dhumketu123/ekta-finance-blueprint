-- ============================================================
-- PHASE 1: DATABASE HARDENING
-- ============================================================

-- 1.1) Replace unique constraint with unique index (idempotency guarantee)
ALTER TABLE public.approval_execution_logs
  DROP CONSTRAINT IF EXISTS unique_request_exec;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_execution_request
  ON public.approval_execution_logs(request_id);

-- 1.2) Observability composite index
CREATE INDEX IF NOT EXISTS idx_exec_logs_request_created
  ON public.approval_execution_logs(request_id, created_at DESC);

-- 1.3) Loan status — column is enum loan_status; CHECK constraint not applicable.
-- Drop any leftover CHECK from previous migration attempts.
ALTER TABLE public.loans
  DROP CONSTRAINT IF EXISTS valid_status_transition;

-- ============================================================
-- PHASE 2 + 3: RACE-SAFE EXECUTION ENGINE (INSERT-FIRST LOCK)
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_req         public.approval_requests%ROWTYPE;
  v_inserted    boolean := false;
  v_user_tenant uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- STEP 1: ATOMIC LOCK VIA INSERT (eliminates race window)
  WITH ins AS (
    INSERT INTO public.approval_execution_logs(request_id, success)
    VALUES (p_request_id, true)
    ON CONFLICT (request_id) DO NOTHING
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('id', p_request_id, 'status', 'ALREADY_EXECUTED');
  END IF;

  -- STEP 2: HARD LOCK on approval row (no SKIP LOCKED)
  SELECT * INTO v_req
    FROM public.approval_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- STEP 3: VALIDATION
  IF v_req.status <> 'APPROVED' THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Request not in APPROVED state (current: %)', v_req.status;
  END IF;

  IF NOT public.is_privileged_user() THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Not authorized to execute approvals';
  END IF;

  SELECT tenant_id INTO v_user_tenant
    FROM public.profiles WHERE id = v_user_id;

  IF v_user_tenant IS NULL OR v_user_tenant <> v_req.tenant_id THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Cross-tenant execution denied';
  END IF;

  -- STEP 4: ROUTER + STATE UPDATE
  BEGIN
    CASE v_req.entity_type
      WHEN 'loan_disbursement' THEN
        PERFORM public.execute_loan_disbursement(p_request_id);
      ELSE
        RAISE EXCEPTION 'Unsupported entity_type: %', v_req.entity_type;
    END CASE;

    UPDATE public.approval_requests
       SET status      = 'EXECUTED',
           executed_at = now(),
           updated_at  = now()
     WHERE id = p_request_id;

    INSERT INTO public.audit_logs(
      action_type, entity_type, entity_id, user_id, details
    ) VALUES (
      'approval_executed',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object(
        'amount', v_req.amount,
        'tenant_id', v_req.tenant_id,
        'action_type', v_req.action_type
      )
    );

    RETURN jsonb_build_object('id', p_request_id, 'status', 'EXECUTED');

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.approval_execution_logs
       SET success       = false,
           error_message = SQLERRM,
           executed_at   = now()
     WHERE request_id = p_request_id;

    UPDATE public.approval_requests
       SET status          = 'EXECUTION_FAILED',
           execution_error = SQLERRM,
           updated_at      = now()
     WHERE id = p_request_id;

    RAISE;
  END;
END;
$$;

ALTER FUNCTION public.process_approved_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_approved_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_approved_request(uuid) TO authenticated;

-- ============================================================
-- PHASE 2.1: RETRY SUPPORT
-- ============================================================
CREATE OR REPLACE FUNCTION public.retry_failed_execution(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status  text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status INTO v_status
    FROM public.approval_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_status <> 'EXECUTION_FAILED' THEN
    RAISE EXCEPTION 'Only EXECUTION_FAILED requests can be retried';
  END IF;

  DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;

  UPDATE public.approval_requests
     SET status          = 'APPROVED',
         execution_error = NULL,
         updated_at      = now()
   WHERE id = p_request_id;

  RETURN public.process_approved_request(p_request_id);
END;
$$;

ALTER FUNCTION public.retry_failed_execution(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.retry_failed_execution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_failed_execution(uuid) TO authenticated;

-- ============================================================
-- PHASE 3: HARDEN execute_loan_disbursement OWNERSHIP
-- ============================================================
ALTER FUNCTION public.execute_loan_disbursement(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_loan_disbursement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_loan_disbursement(uuid) TO authenticated;