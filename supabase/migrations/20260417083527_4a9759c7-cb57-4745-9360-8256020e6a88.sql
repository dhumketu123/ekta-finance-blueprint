-- ============================================================
-- CONTROLLED-FAILURE STUB PATTERN
-- Cleaner UX: no exception throws, no error toasts, controlled state.
-- ============================================================

-- 1) Reusable controlled-failure helper.
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
  -- Controlled state transition (NO EXCEPTION).
  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = format('NOT_IMPLEMENTED: %s', p_entity_type),
      updated_at = now()
  WHERE id = p_request_id;

  -- Update the optimistic exec-log row inserted by the router (race-safe lock).
  UPDATE public.approval_execution_logs
  SET success = false,
      error_message = format('Stub executor not implemented: %s', p_entity_type)
  WHERE request_id = p_request_id;

  -- Audit trail.
  INSERT INTO public.audit_logs (
    action_type, entity_type, entity_id, user_id, details
  ) VALUES (
    'approval_execution_stubbed',
    p_entity_type,
    p_request_id,
    auth.uid(),
    jsonb_build_object(
      'status', 'NOT_IMPLEMENTED',
      'entity_type', p_entity_type
    )
  );
END;
$$;

ALTER FUNCTION public.execute_stub_not_ready(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_stub_not_ready(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_stub_not_ready(uuid, text) TO authenticated;


-- 2) Refactor the 5 entity stubs to use the controlled helper.
CREATE OR REPLACE FUNCTION public.execute_loan_reschedule(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.execute_stub_not_ready(p_request_id, 'loan_reschedule');
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_early_settlement(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.execute_stub_not_ready(p_request_id, 'early_settlement');
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_profit_distribution(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.execute_stub_not_ready(p_request_id, 'profit_distribution');
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_owner_exit(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.execute_stub_not_ready(p_request_id, 'owner_exit');
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_journal_adjustment(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.execute_stub_not_ready(p_request_id, 'journal_adjustment');
END;
$$;


-- 3) Router upgrade — detect stub-handled requests and skip EXECUTED transition.
--    The stub already sets status=EXECUTION_FAILED; we must not overwrite it.
CREATE OR REPLACE FUNCTION public.process_approved_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req           record;
  v_user_id       uuid := auth.uid();
  v_inserted      boolean;
  v_post_status   text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Race-safe atomic lock via INSERT-first pattern.
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

  -- Hard lock the approval request row.
  SELECT *
  INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
    -- Entity router — full coverage of all 6 entity types.
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

    -- Re-read status: if a stub set EXECUTION_FAILED, do NOT overwrite it.
    SELECT status INTO v_post_status
    FROM public.approval_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_post_status = 'EXECUTION_FAILED' THEN
      -- Stub handled it cleanly. Audit the controlled stub outcome.
      INSERT INTO public.audit_logs(action_type, entity_type, entity_id, user_id, details)
      VALUES (
        'approval_execution_not_ready',
        v_req.entity_type,
        p_request_id,
        v_user_id,
        jsonb_build_object('amount', v_req.amount, 'reason', 'stub_not_implemented')
      );
      RETURN jsonb_build_object('status', 'NOT_IMPLEMENTED', 'entity_type', v_req.entity_type);
    END IF;

    -- Real executor succeeded — finalize EXECUTED state.
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
    -- Real executor failure path (not stub). Mark + log.
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
-- END — Stubs now fail cleanly without throwing; router aware.
-- ============================================================