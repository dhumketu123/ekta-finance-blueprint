-- =============================================================
-- Fix 1: Make `clients` tenant isolation RESTRICTIVE so it acts as
--        a hard tenant ceiling instead of an additional access path.
-- =============================================================

-- Drop the over-permissive ALL policy
DROP POLICY IF EXISTS "Tenant isolation clients" ON public.clients;

-- Recreate as RESTRICTIVE (tenant ceiling for everyone)
CREATE POLICY "Tenant isolation clients"
ON public.clients
AS RESTRICTIVE
FOR ALL
TO public
USING (
  (get_user_role() = 'super_admin'::text)
  OR (tenant_id = get_user_tenant_id())
)
WITH CHECK (
  (get_user_role() = 'super_admin'::text)
  OR (tenant_id = get_user_tenant_id())
);

-- Restore narrow PERMISSIVE write paths for non-admin roles that
-- previously relied on the ALL tenant-isolation policy:

-- Field officers may update only their assigned clients (e.g. photo upload).
CREATE POLICY "Field officers update assigned clients"
ON public.clients
AS PERMISSIVE
FOR UPDATE
TO public
USING (
  is_field_officer()
  AND assigned_officer = auth.uid()
  AND deleted_at IS NULL
)
WITH CHECK (
  is_field_officer()
  AND assigned_officer = auth.uid()
);

-- Managers retain insert/update within their tenant (bulk onboarding etc.)
CREATE POLICY "Manager write clients"
ON public.clients
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Manager update clients"
ON public.clients
AS PERMISSIVE
FOR UPDATE
TO public
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND deleted_at IS NULL
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
);

-- =============================================================
-- Fix 2: Tenant-scope the treasurer SELECT policy on sms_logs
-- =============================================================

DROP POLICY IF EXISTS "Treasurer view sms_logs" ON public.sms_logs;

CREATE POLICY "Treasurer view sms_logs"
ON public.sms_logs
AS PERMISSIVE
FOR SELECT
TO public
USING (
  is_treasurer()
  AND tenant_id = get_user_tenant_id()
);

-- =============================================================
-- Fix 3: Server-side has_transaction_pin RPC so the bcrypt hash
--        is never returned to the browser.
-- =============================================================

CREATE OR REPLACE FUNCTION public.has_transaction_pin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(transaction_pin_hash IS NOT NULL, false)
  FROM public.profiles
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.has_transaction_pin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_transaction_pin() TO authenticated;
