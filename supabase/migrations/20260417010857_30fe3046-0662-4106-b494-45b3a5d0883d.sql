-- ============================================================
-- 1) CENTRALIZED PRIVILEGE CHECK HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_privileged_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role);
$$;

REVOKE ALL ON FUNCTION public.is_privileged_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_user() TO authenticated;

-- ============================================================
-- 2) HARDENED decide_approval_request
--    - search_path lock
--    - cross-tenant guard
--    - privilege check via is_privileged_user()
--    - row lock with FOR UPDATE SKIP LOCKED
--    - strict status transition enforcement
--    - maker != checker enforcement
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_approval_request(
  p_request_id uuid,
  p_decision   text,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req         approval_requests%ROWTYPE;
  v_user_id     uuid := auth.uid();
  v_user_tenant uuid;
BEGIN
  -- AuthN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Decision sanity
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  -- Privilege check
  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  -- Race-safe row lock
  SELECT * INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found or already being processed';
  END IF;

  -- Tenant safety
  IF v_req.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid request context';
  END IF;

  SELECT tenant_id INTO v_user_tenant
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_user_tenant IS NULL OR v_user_tenant <> v_req.tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  -- Maker != Checker
  IF v_req.maker_id = v_user_id THEN
    RAISE EXCEPTION 'Maker cannot approve their own request';
  END IF;

  -- Status immutability: only PENDING can be decided
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request is not pending (current status: %)', v_req.status;
  END IF;

  -- Apply decision
  UPDATE public.approval_requests
  SET
    status            = p_decision,
    checker_id        = v_user_id,
    approved_at       = CASE WHEN p_decision = 'APPROVED' THEN now() ELSE approved_at END,
    rejection_reason  = CASE WHEN p_decision = 'REJECTED' THEN p_reason ELSE NULL END,
    updated_at        = now()
  WHERE id = p_request_id;

  -- Audit log (best effort)
  BEGIN
    INSERT INTO public.audit_logs (
      action_type, entity_type, entity_id, user_id, new_value, details
    ) VALUES (
      'approval_decision',
      'approval_request',
      p_request_id,
      v_user_id,
      jsonb_build_object('status', p_decision, 'reason', p_reason),
      jsonb_build_object(
        'entity_type', v_req.entity_type,
        'action_type', v_req.action_type,
        'amount', v_req.amount
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'id', p_request_id,
    'status', p_decision,
    'checker_id', v_user_id
  );
END;
$$;

-- ============================================================
-- 3) HARDENED create_approval_request
--    - search_path lock
--    - tenant from profile (no spoofing)
--    - amount sanity
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_entity_type text,
  p_action_type text,
  p_payload     jsonb,
  p_entity_id   uuid    DEFAULT NULL,
  p_amount      numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_tenant_id uuid;
  v_new_id    uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_entity_type IS NULL OR length(trim(p_entity_type)) = 0 THEN
    RAISE EXCEPTION 'entity_type is required';
  END IF;

  IF p_action_type IS NULL OR length(trim(p_action_type)) = 0 THEN
    RAISE EXCEPTION 'action_type is required';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'amount cannot be negative';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not resolved for current user';
  END IF;

  INSERT INTO public.approval_requests (
    tenant_id, entity_type, entity_id, action_type,
    payload, amount, status, maker_id
  ) VALUES (
    v_tenant_id, p_entity_type, p_entity_id, p_action_type,
    COALESCE(p_payload, '{}'::jsonb), p_amount, 'PENDING', v_user_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================
-- 4) EXECUTION CONTROL — REVOKE PUBLIC, GRANT authenticated
-- ============================================================
REVOKE ALL ON FUNCTION public.create_approval_request(text,text,jsonb,uuid,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_approval_request(uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_approval_request(text,text,jsonb,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_approval_request(uuid,text,text) TO authenticated;