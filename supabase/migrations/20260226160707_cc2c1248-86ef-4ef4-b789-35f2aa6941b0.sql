
-- ─────────────── 1️⃣ Tenant-specific Settings Table ───────────────
CREATE TABLE IF NOT EXISTS public.tenant_settings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, setting_key)
);

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- Tenant isolation
CREATE POLICY "Tenant isolation tenant_settings"
ON public.tenant_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  (get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id())
)
WITH CHECK (
  (get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id())
);

-- Admin/owner full access
CREATE POLICY "Admin_owner full access tenant_settings"
ON public.tenant_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (is_admin_or_owner())
WITH CHECK (is_admin_or_owner());

-- Authenticated read
CREATE POLICY "Authenticated read tenant_settings"
ON public.tenant_settings
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (true);

-- Deny anon
CREATE POLICY "Deny anonymous tenant_settings"
ON public.tenant_settings
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- ─────────────── 2️⃣ Upsert Tenant Settings RPC ───────────────
CREATE OR REPLACE FUNCTION public.upsert_tenant_setting(
    p_setting_key TEXT,
    p_setting_value JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_user_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No tenant context found for current user';
    END IF;

    INSERT INTO public.tenant_settings(tenant_id, setting_key, setting_value)
    VALUES (v_tenant_id, p_setting_key, p_setting_value)
    ON CONFLICT (tenant_id, setting_key)
    DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = now();
END;
$$;

-- ─────────────── 3️⃣ Updated Upsert Tenant Rule RPC ───────────────
CREATE OR REPLACE FUNCTION public.upsert_tenant_rule(
    p_rule_key TEXT,
    p_rule_value JSONB,
    p_description TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_user_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No tenant context found for current user';
    END IF;

    INSERT INTO public.tenant_rules(tenant_id, rule_key, rule_value, description)
    VALUES (v_tenant_id, p_rule_key, p_rule_value, p_description)
    ON CONFLICT (tenant_id, rule_key)
    DO UPDATE SET
        rule_value = EXCLUDED.rule_value,
        description = COALESCE(EXCLUDED.description, public.tenant_rules.description);
END;
$$;

-- ─────────────── 4️⃣ Timestamp trigger ───────────────
CREATE OR REPLACE FUNCTION public.update_tenant_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_settings_updated_at();
