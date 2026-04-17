-- ============================================================
-- PHASE 3 HARDENING PATCH — GAP CLOSURE PACK
-- ============================================================

-- 1) STRICT DECISION VALIDATION + PRIVILEGE GUARD
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
  v_user_id uuid := auth.uid();
  v_req     public.approval_requests%ROWTYPE;
  v_user_tenant uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Strict decision validation
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid decision value';
  END IF;

  -- Explicit privilege guard (no UI trust)
  IF NOT public.is_privileged_user() THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  -- Race-safe row lock
  SELECT *
  INTO v_req
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or locked';
  END IF;

  -- Cross-tenant protection
  SELECT tenant_id INTO v_user_tenant FROM public.profiles WHERE id = v_user_id;
  IF v_req.tenant_id IS NULL OR v_req.tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  -- Maker != Checker
  IF v_req.maker_id = v_user_id THEN
    RAISE EXCEPTION 'Maker cannot approve their own request';
  END IF;

  -- Status immutability — only PENDING can be decided
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request already decided';
  END IF;

  UPDATE public.approval_requests
  SET
    status = p_decision,
    checker_id = v_user_id,
    approved_at = CASE WHEN p_decision = 'APPROVED' THEN now() ELSE approved_at END,
    rejection_reason = CASE WHEN p_decision = 'REJECTED' THEN p_reason ELSE NULL END,
    updated_at = now()
  WHERE id = p_request_id;

  -- Audit log entry
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES (
    'approval_decision',
    'approval_request',
    p_request_id,
    v_user_id,
    jsonb_build_object('decision', p_decision, 'reason', p_reason)
  );

  RETURN jsonb_build_object('id', p_request_id, 'status', p_decision);
END;
$$;


-- 2) ENFORCE STATUS CHECK CONSTRAINT (TABLE LEVEL)
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_status_valid;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_status_valid
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXECUTED','EXECUTION_FAILED'));


-- 3) HARD BLOCK DIRECT TABLE WRITES (RPC-only architecture)
REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM anon;


-- 4) ENABLE & ENFORCE RLS (failsafe)
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON public.approval_requests;

CREATE POLICY tenant_isolation_select
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);


-- 5) ENSURE FUNCTIONS OWNED BY postgres (SECURITY DEFINER safety)
ALTER FUNCTION public.create_approval_request(text, text, jsonb, uuid, numeric)
  OWNER TO postgres;

ALTER FUNCTION public.decide_approval_request(uuid, text, text)
  OWNER TO postgres;

ALTER FUNCTION public.is_privileged_user()
  OWNER TO postgres;


-- 6) EXTRA DEFENSE: CHECKER REQUIRED WHEN APPROVED
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS checker_required_if_approved;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT checker_required_if_approved
  CHECK (
    (status <> 'APPROVED')
    OR (status = 'APPROVED' AND checker_id IS NOT NULL)
  );
