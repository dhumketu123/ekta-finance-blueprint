
-- ============================================================
-- PHASE 2.1: Production-Grade JWT Tenant Hardening
-- ============================================================

-- ----------------------------------------------------------
-- STEP 1: Strict JWT-only tenant resolution (no fallback)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- ----------------------------------------------------------
-- STEP 2: Strict JWT-only role resolution
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.jwt() ->> 'user_role';
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_user_role() = 'super_admin', false);
$$;

-- ----------------------------------------------------------
-- STEP 3: Rewrite all tenant isolation RLS policies
-- ----------------------------------------------------------

-- === PROFILES ===
DROP POLICY IF EXISTS "Tenant isolation profiles" ON public.profiles;
CREATE POLICY "Tenant isolation profiles"
  ON public.profiles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- === CLIENTS ===
DROP POLICY IF EXISTS "Tenant isolation clients" ON public.clients;
CREATE POLICY "Tenant isolation clients"
  ON public.clients AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- === LOANS ===
DROP POLICY IF EXISTS "Tenant isolation loans" ON public.loans;
CREATE POLICY "Tenant isolation loans"
  ON public.loans AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- === SAVINGS_ACCOUNTS ===
DROP POLICY IF EXISTS "Tenant isolation savings_accounts" ON public.savings_accounts;
CREATE POLICY "Tenant isolation savings_accounts"
  ON public.savings_accounts AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- === INVESTORS ===
DROP POLICY IF EXISTS "Tenant isolation investors" ON public.investors;
CREATE POLICY "Tenant isolation investors"
  ON public.investors AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- === SYSTEM_SETTINGS ===
DROP POLICY IF EXISTS "Tenant isolation system_settings" ON public.system_settings;
CREATE POLICY "Tenant isolation system_settings"
  ON public.system_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  )
  WITH CHECK (
    public.get_user_role() = 'super_admin'
    OR tenant_id = public.get_user_tenant_id()
  );

-- ----------------------------------------------------------
-- STEP 4: Lock down tenants table — super_admin only
-- ----------------------------------------------------------
DROP POLICY IF EXISTS "Super admin full access tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;

CREATE POLICY "Super admin only tenants"
  ON public.tenants AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.get_user_role() = 'super_admin')
  WITH CHECK (public.get_user_role() = 'super_admin');

-- ----------------------------------------------------------
-- STEP 5: Secure handle_new_user — block direct signup
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Direct signup disabled. Use invite-based tenant creation.';
  RETURN NEW;
END;
$$;
