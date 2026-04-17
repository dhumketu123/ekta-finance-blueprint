-- ============================================================
-- ENTITY EXECUTOR STUBS — Future-ready placeholders
-- Surgical: extends router only; does NOT touch existing logic
-- ============================================================

-- 1) Stub executors — each raises a clean "Not yet implemented" error.
--    process_approved_request's EXCEPTION block will catch this and
--    correctly mark status=EXECUTION_FAILED + log to approval_execution_logs
--    + record execution_error. No crash, no data change, fully audited.

CREATE OR REPLACE FUNCTION public.execute_loan_reschedule(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'NOT_IMPLEMENTED: loan_reschedule executor pending business wiring (request %)', p_request_id;
END;
$$;
ALTER FUNCTION public.execute_loan_reschedule(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_loan_reschedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_loan_reschedule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_early_settlement(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'NOT_IMPLEMENTED: early_settlement executor pending business wiring (request %)', p_request_id;
END;
$$;
ALTER FUNCTION public.execute_early_settlement(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_early_settlement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_early_settlement(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_profit_distribution(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'NOT_IMPLEMENTED: profit_distribution executor pending business wiring (request %)', p_request_id;
END;
$$;
ALTER FUNCTION public.execute_profit_distribution(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_profit_distribution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_profit_distribution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_owner_exit(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- NOTE: process_owner_exit() exists but its signature/business contract
  -- needs explicit binding before wiring. Kept as stub for safety.
  RAISE EXCEPTION 'NOT_IMPLEMENTED: owner_exit executor pending business wiring (request %)', p_request_id;
END;
$$;
ALTER FUNCTION public.execute_owner_exit(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_owner_exit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_owner_exit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_journal_adjustment(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'NOT_IMPLEMENTED: journal_adjustment executor pending business wiring (request %)', p_request_id;
END;
$$;
ALTER FUNCTION public.execute_journal_adjustment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_journal_adjustment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_journal_adjustment(uuid) TO authenticated;


-- 2) Extend process_approved_request router to dispatch all 6 entity types.
--    Preserves the INSERT-first race-safe lock pattern, hard row lock,
--    privileged-user check, audit trail, and EXCEPTION rollback path.

CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req      record;
  v_user_id  uuid := auth.uid();
  v_inserted boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- STEP 1: Race-safe atomic lock via INSERT-first pattern.
  WITH ins AS (
    INSERT INTO public.approval_execution_logs(request_id, success)
    VALUES (p_request_id, true)
    ON CONFLICT (request_id) DO NOTHING
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('status', 'ALREADY_EXECUTED');
  END IF;

  -- STEP 2: Hard lock approval_requests row.
  SELECT *
  INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Roll back the optimistic exec-log row so retry is possible.
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_req.status <> 'APPROVED' THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Not approved (current status: %)', v_req.status;
  END IF;

  IF NOT public.is_privileged_user() THEN
    DELETE FROM public.approval_execution_logs WHERE request_id = p_request_id;
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  BEGIN
    -- STEP 3: Entity router — full coverage of all 6 entity types.
    CASE v_req.entity_type
      WHEN 'loan_disbursement'    THEN PERFORM public.execute_loan_disbursement(p_request_id);
      WHEN 'loan_reschedule'      THEN PERFORM public.execute_loan_reschedule(p_request_id);
      WHEN 'early_settlement'     THEN PERFORM public.execute_early_settlement(p_request_id);
      WHEN 'profit_distribution'  THEN PERFORM public.execute_profit_distribution(p_request_id);
      WHEN 'owner_exit'           THEN PERFORM public.execute_owner_exit(p_request_id);
      WHEN 'journal_adjustment'   THEN PERFORM public.execute_journal_adjustment(p_request_id);
      ELSE
        RAISE EXCEPTION 'Unsupported entity_type: %', v_req.entity_type;
    END CASE;

    -- STEP 4: Final state update.
    UPDATE public.approval_requests
    SET status = 'EXECUTED',
        executed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs(action_type, entity_type, entity_id, user_id, details)
    VALUES (
      'approval_executed',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object('amount', v_req.amount, 'entity_id', v_req.entity_id)
    );

    RETURN jsonb_build_object('status', 'EXECUTED');

  EXCEPTION WHEN OTHERS THEN
    -- Atomically mark failed + update exec log with error.
    UPDATE public.approval_requests
    SET status = 'EXECUTION_FAILED',
        execution_error = SQLERRM,
        updated_at = now()
    WHERE id = p_request_id;

    UPDATE public.approval_execution_logs
    SET success = false,
        error_message = SQLERRM
    WHERE request_id = p_request_id;

    INSERT INTO public.audit_logs(action_type, entity_type, entity_id, user_id, details)
    VALUES (
      'approval_execution_failed',
      v_req.entity_type,
      p_request_id,
      v_user_id,
      jsonb_build_object('error', SQLERRM, 'amount', v_req.amount)
    );

    RAISE;
  END;
END;
$$;

ALTER FUNCTION public.process_approved_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_approved_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_approved_request(uuid) TO authenticated;

-- ============================================================
-- END — Router now covers all 6 entity types; 5 are safe stubs.
-- ============================================================