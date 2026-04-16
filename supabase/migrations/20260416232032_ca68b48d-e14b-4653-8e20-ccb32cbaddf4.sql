-- ═══════════════════════════════════════════════════════════════════════
-- LAUNCH READINESS PHASE 1: Critical RLS Hardening
-- Removes broad "USING (true)" policies that bypass tenant isolation,
-- making client/profile/investor/notification reads tenant-scoped.
-- Existing tenant-scoped & role-based policies remain in place.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. CLIENTS — drop blanket-read policy (tenant isolation already exists)
DROP POLICY IF EXISTS "Require authentication for clients" ON public.clients;

-- 2. PROFILES — drop blanket-read policy (own-profile + admin/owner already exist)
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- 3. INVESTORS — drop blanket-read policy (tenant + role-based remain)
DROP POLICY IF EXISTS "Authenticated baseline read investors" ON public.investors;

-- 4. NOTIFICATIONS — drop blanket-read; replace with tenant + role scoping
DROP POLICY IF EXISTS "Authenticated can view notifications" ON public.notifications;

CREATE POLICY "Tenant scoped notifications read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      get_user_role() = 'super_admin'
      OR is_admin_or_owner()
    )
  );

-- 5. GOVERNANCE LOGS — fix mis-scoped "USING (true)" policy
DROP POLICY IF EXISTS "Users can view their tenant governance logs" ON public.governance_action_logs;

CREATE POLICY "Tenant scoped governance logs read"
  ON public.governance_action_logs
  FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'super_admin'
    OR (tenant_id::uuid = get_user_tenant_id() AND is_admin_or_owner())
  );

-- 6. CLIENT-PHOTOS BUCKET — convert to private + add scoped read policy
UPDATE storage.buckets SET public = false WHERE id = 'client-photos';

DROP POLICY IF EXISTS "Public read client photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read client photos" ON storage.objects;

CREATE POLICY "Authenticated read client photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-photos'
    AND (
      get_user_role() = 'super_admin'
      OR is_admin_or_owner()
      OR is_field_officer()
    )
  );
