-- 1) Remove broken global deny policy
DROP POLICY IF EXISTS deny_all_writes ON public.approval_requests;

-- 2) Strict block: direct UPDATE and DELETE (separate policies — Postgres requires one command per policy)
DROP POLICY IF EXISTS deny_direct_update ON public.approval_requests;
CREATE POLICY deny_direct_update
ON public.approval_requests
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS deny_direct_delete ON public.approval_requests;
CREATE POLICY deny_direct_delete
ON public.approval_requests
FOR DELETE
TO authenticated
USING (false);

-- 3) Strict block: direct INSERT
DROP POLICY IF EXISTS deny_direct_insert ON public.approval_requests;
CREATE POLICY deny_direct_insert
ON public.approval_requests
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 4) Tenant-isolated SELECT
DROP POLICY IF EXISTS tenant_isolation_select ON public.approval_requests;
CREATE POLICY tenant_isolation_select
ON public.approval_requests
FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- 5) Ensure RLS enabled
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- 6) SECURITY DEFINER ownership
ALTER FUNCTION public.create_approval_request(text, text, jsonb, uuid, numeric) OWNER TO postgres;
ALTER FUNCTION public.decide_approval_request(uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.is_privileged_user() OWNER TO postgres;

-- 7) Reconfirm constraints
ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS approval_status_valid;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_status_valid
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXECUTED','EXECUTION_FAILED'));

ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS checker_required_if_approved;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT checker_required_if_approved
  CHECK ((status <> 'APPROVED') OR (status = 'APPROVED' AND checker_id IS NOT NULL));

ALTER TABLE public.approval_requests DROP CONSTRAINT IF EXISTS rejection_reason_required;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT rejection_reason_required
  CHECK ((status <> 'REJECTED') OR (status = 'REJECTED' AND rejection_reason IS NOT NULL));