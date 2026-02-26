
-- ============================================================
-- PHASE 2: JWT-Based Tenant Isolation
-- ============================================================

-- ----------------------------------------------------------
-- STEP 1: Remove dangerous DEFAULT tenant_id from all tables
-- ----------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.clients ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.loans ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.savings_accounts ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.investors ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.system_settings ALTER COLUMN tenant_id DROP DEFAULT;

-- ----------------------------------------------------------
-- STEP 2: Update handle_new_user to inject tenant_id from context
-- The trigger assigns the default tenant for now; admin can
-- reassign later. This replaces the column-level default.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_tenant uuid;
BEGIN
  -- Get the default tenant (first active tenant)
  SELECT id INTO v_default_tenant
  FROM public.tenants
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_tenant IS NULL THEN
    RAISE EXCEPTION 'No active tenant found for new user assignment';
  END IF;

  -- Upsert profile with tenant_id (handles race with other triggers)
  INSERT INTO public.profiles (id, tenant_id)
  VALUES (NEW.id, v_default_tenant)
  ON CONFLICT (id) DO UPDATE
    SET tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id);

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (drop + recreate to avoid duplication)
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------
-- STEP 3: Custom Access Token Hook (JWT claim injection)
-- Supabase calls this on every token refresh to embed
-- tenant_id and role into the JWT.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_role text;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;

  -- Fetch tenant_id and role from profiles
  SELECT p.tenant_id, COALESCE(ur.role::text, 'user')
  INTO v_tenant_id, v_role
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.id = v_user_id;

  -- Build claims
  claims := event -> 'claims';

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  END IF;

  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(v_role, 'user')));

  -- Return modified event
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant execute to supabase_auth_admin (required for auth hooks)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- Grant read access on profiles and user_roles to supabase_auth_admin
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
GRANT SELECT ON TABLE public.user_roles TO supabase_auth_admin;

-- ----------------------------------------------------------
-- STEP 4: Helper to extract tenant_id from JWT (with fallback)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Prefer JWT claim (fast, no query)
    (auth.jwt() ->> 'tenant_id')::uuid,
    -- Fallback to profile lookup (handles first login before token refresh)
    (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );
$$;

-- ----------------------------------------------------------
-- STEP 5: Helper to check super_admin status from JWT
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'user_role') = 'super_admin',
    false
  );
$$;

-- ----------------------------------------------------------
-- STEP 6: Rewrite tenant isolation RLS policies with JWT + super_admin bypass
-- ----------------------------------------------------------

-- === PROFILES ===
DROP POLICY IF EXISTS "Tenant isolation profiles" ON public.profiles;
CREATE POLICY "Tenant isolation profiles"
  ON public.profiles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === CLIENTS ===
DROP POLICY IF EXISTS "Tenant isolation clients" ON public.clients;
CREATE POLICY "Tenant isolation clients"
  ON public.clients AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === LOANS ===
DROP POLICY IF EXISTS "Tenant isolation loans" ON public.loans;
CREATE POLICY "Tenant isolation loans"
  ON public.loans AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === SAVINGS_ACCOUNTS ===
DROP POLICY IF EXISTS "Tenant isolation savings_accounts" ON public.savings_accounts;
CREATE POLICY "Tenant isolation savings_accounts"
  ON public.savings_accounts AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === INVESTORS ===
DROP POLICY IF EXISTS "Tenant isolation investors" ON public.investors;
CREATE POLICY "Tenant isolation investors"
  ON public.investors AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === SYSTEM_SETTINGS ===
DROP POLICY IF EXISTS "Tenant isolation system_settings" ON public.system_settings;
CREATE POLICY "Tenant isolation system_settings"
  ON public.system_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id = get_user_tenant_id()
  );

-- === TENANTS (update for super_admin) ===
DROP POLICY IF EXISTS "Admin full access tenants" ON public.tenants;
CREATE POLICY "Super admin full access tenants"
  ON public.tenants AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    is_super_admin()
    OR has_role(auth.uid(), 'admin')
  );
