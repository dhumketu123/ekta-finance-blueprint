-- 1) REJECT reason required if REJECTED
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS rejection_reason_required;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT rejection_reason_required
  CHECK (
    (status <> 'REJECTED')
    OR
    (status = 'REJECTED' AND rejection_reason IS NOT NULL)
  );


-- 2) Explicit NO WRITE RLS policy (failsafe)
DROP POLICY IF EXISTS deny_all_writes ON public.approval_requests;

CREATE POLICY deny_all_writes
ON public.approval_requests
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);


-- 3) Ensure is_privileged_user has locked search_path + safe role lookup
CREATE OR REPLACE FUNCTION public.is_privileged_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'owner'::app_role)
    OR public.has_role(v_user_id, 'super_admin'::app_role);
END;
$$;

ALTER FUNCTION public.is_privileged_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_privileged_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_user() TO authenticated;