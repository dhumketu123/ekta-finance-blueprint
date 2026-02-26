
-- =====================================================
-- PHASE 1: Multi-Tenant Foundation Migration (v2)
-- =====================================================

-- ─── STEP 1: Create tenants table ───
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── STEP 2: Insert default tenant ───
INSERT INTO public.tenants (id, name, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'enterprise', 'active');

-- ─── STEP 3: Add tenant_id columns (nullable first) ───
ALTER TABLE public.profiles
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.clients
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.loans
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.savings_accounts
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.investors
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.system_settings
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ─── STEP 4: Backfill existing data ───
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.clients SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.loans SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.savings_accounts SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.investors SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.system_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ─── STEP 5: NOT NULL + DEFAULT ───
ALTER TABLE public.profiles ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.clients ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.loans ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.savings_accounts ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.investors ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.system_settings ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- ─── STEP 6: Composite unique constraints ───
DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE t.relname = 'system_settings' AND n.nspname = 'public' AND c.contype = 'u'
    AND EXISTS (
      SELECT 1 FROM unnest(c.conkey) k
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k
      WHERE a.attname = 'setting_key'
    );
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.system_settings DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_setting_key_tenant_id_key UNIQUE (setting_key, tenant_id);

-- ─── STEP 7: Helper function (NOW columns exist) ───
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;

-- ─── STEP 8: Update upsert_system_setting to tenant-aware ───
CREATE OR REPLACE FUNCTION public.upsert_system_setting(
  p_setting_key text,
  p_setting_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  v_tenant_id := (SELECT tenant_id FROM public.profiles WHERE id = v_user_id);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user';
  END IF;
  INSERT INTO public.system_settings (setting_key, setting_value, updated_by, tenant_id)
  VALUES (p_setting_key, p_setting_value, v_user_id, v_tenant_id)
  ON CONFLICT (setting_key, tenant_id) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_system_setting(text, jsonb) TO authenticated;

-- ─── STEP 9: Tenant-isolation RLS (RESTRICTIVE, layered on existing role-based) ───
CREATE POLICY "Tenant isolation profiles"
  ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation clients"
  ON public.clients AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation loans"
  ON public.loans AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation savings_accounts"
  ON public.savings_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation investors"
  ON public.investors AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant isolation system_settings"
  ON public.system_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ─── STEP 10: Performance indexes ───
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_clients_tenant_id ON public.clients(tenant_id);
CREATE INDEX idx_loans_tenant_id ON public.loans(tenant_id);
CREATE INDEX idx_savings_accounts_tenant_id ON public.savings_accounts(tenant_id);
CREATE INDEX idx_investors_tenant_id ON public.investors(tenant_id);
CREATE INDEX idx_system_settings_tenant_id ON public.system_settings(tenant_id);
