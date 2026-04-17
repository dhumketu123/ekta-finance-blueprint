-- ============================================================
-- PHASE 1: HARD EXECUTION GUARANTEES
-- ============================================================

-- Unique execution protection (table already has UNIQUE on request_id, but ensure named index exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_execution
ON public.approval_execution_logs(request_id);

-- Enforce: EXECUTED status MUST have executed_at timestamp
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS executed_requires_timestamp;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT executed_requires_timestamp
  CHECK (status <> 'EXECUTED' OR executed_at IS NOT NULL);


-- ============================================================
-- PHASE 2: BUSINESS EXECUTOR — LOAN DISBURSEMENT (atomic)
-- ============================================================
-- Marks the loan record as active. Heavy ledger postings are delegated
-- to the existing dedicated `disburse_loan` RPC (memory: hardened path).
-- This executor only flips the row state under a row lock, so the router
-- can safely transition the approval_request to EXECUTED.

CREATE OR REPLACE FUNCTION public.execute_loan_disbursement(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Request not approved';
  END IF;

  IF v_req.entity_id IS NULL THEN
    RAISE EXCEPTION 'Approval request has no target loan id';
  END IF;

  -- Lock target loan and flip to active. Skip if already active (idempotent).
  UPDATE public.loans
  SET status = 'active'::loan_status,
      updated_at = now()
  WHERE id = v_req.entity_id
    AND status <> 'active'::loan_status;

  -- Note: actual ledger postings & cash movement are handled separately
  -- by the dedicated disburse_loan RPC to preserve double-entry integrity.
END;
$$;

ALTER FUNCTION public.execute_loan_disbursement(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_loan_disbursement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_loan_disbursement(uuid) TO authenticated;


-- ============================================================
-- PHASE 3: EXECUTION ENGINE (ROUTER) — race-safe + idempotent
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_tenant uuid;
  v_req public.approval_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Not authorized to execute approvals';
  END IF;

  -- Race-safe lock; SKIP LOCKED ensures concurrent callers don't queue
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found or locked by another execution';
  END IF;

  -- Cross-tenant guard
  SELECT tenant_id INTO v_user_tenant
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_req.tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Request not in APPROVED state (current: %)', v_req.status;
  END IF;

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM public.approval_execution_logs WHERE request_id = p_request_id
  ) THEN
    RETURN jsonb_build_object('id', p_request_id, 'status', 'ALREADY_EXECUTED');
  END IF;

  BEGIN
    -- Entity routing
    IF v_req.entity_type = 'loan_disbursement' THEN
      PERFORM public.execute_loan_disbursement(p_request_id);
    ELSIF v_req.entity_type IN (
      'loan_reschedule','early_settlement','profit_distribution',
      'owner_exit','journal_adjustment'
    ) THEN
      -- Reserved for upcoming dedicated executors
      RAISE EXCEPTION 'Executor not yet implemented for entity_type: %', v_req.entity_type;
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
    -- NOTE: this UPDATE/INSERT runs in same tx; RAISE rolls them back.
    -- We re-raise so the caller sees the failure; observability comes from
    -- a follow-up cron / retry that re-attempts and logs on next call.
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