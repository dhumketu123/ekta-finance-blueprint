-- ============================================================
-- ROUTER SIMPLIFICATION — Direct stub dispatch
-- Removes 5 redundant wrapper functions; router calls stub helper directly.
-- ============================================================

-- 1) Update router to call execute_stub_not_ready() directly for unimplemented entities.
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
    -- Entity router — direct stub dispatch (no wrapper layer).
    CASE v_req.entity_type
      WHEN 'loan_disbursement' THEN
        PERFORM public.execute_loan_disbursement(p_request_id);
      WHEN 'loan_reschedule' THEN
        PERFORM public.execute_stub_not_ready(p_request_id, 'loan_reschedule');
      WHEN 'early_settlement' THEN
        PERFORM public.execute_stub_not_ready(p_request_id, 'early_settlement');
      WHEN 'profit_distribution' THEN
        PERFORM public.execute_stub_not_ready(p_request_id, 'profit_distribution');
      WHEN 'owner_exit' THEN
        PERFORM public.execute_stub_not_ready(p_request_id, 'owner_exit');
      WHEN 'journal_adjustment' THEN
        PERFORM public.execute_stub_not_ready(p_request_id, 'journal_adjustment');
      ELSE
        RAISE EXCEPTION 'Unsupported entity_type: %', v_req.entity_type;
    END CASE;

    -- Re-read status: if stub set EXECUTION_FAILED, do NOT overwrite it.
    SELECT status INTO v_post_status
    FROM public.approval_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_post_status = 'EXECUTION_FAILED' THEN
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


-- 2) Drop the 5 now-redundant wrapper functions.
DROP FUNCTION IF EXISTS public.execute_loan_reschedule(uuid);
DROP FUNCTION IF EXISTS public.execute_early_settlement(uuid);
DROP FUNCTION IF EXISTS public.execute_profit_distribution(uuid);
DROP FUNCTION IF EXISTS public.execute_owner_exit(uuid);
DROP FUNCTION IF EXISTS public.execute_journal_adjustment(uuid);

-- ============================================================
-- END — Router now dispatches stubs directly. Cleaner, fewer functions.
-- ============================================================