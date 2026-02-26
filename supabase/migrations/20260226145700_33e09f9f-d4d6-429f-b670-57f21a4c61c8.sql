
-- ================================================
-- Phase 3: White-Label & Tenant Customization
-- ================================================

-- 1. Tenant Config table (branding: logo, colors, name)
CREATE TABLE public.tenant_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  display_name_bn text NOT NULL DEFAULT '',
  logo_url text,
  header_bg_url text,
  primary_color text NOT NULL DEFAULT '#004c4d',
  secondary_color text NOT NULL DEFAULT '#ffd900',
  accent_color text NOT NULL DEFAULT '#059669',
  footer_text text DEFAULT '',
  sms_sender_name text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;

-- RLS: tenant isolation
CREATE POLICY "Tenant isolation tenant_config"
  ON public.tenant_config AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (get_user_role() = 'super_admin' OR tenant_id = get_user_tenant_id())
  WITH CHECK (get_user_role() = 'super_admin' OR tenant_id = get_user_tenant_id());

-- RLS: admin/owner can manage
CREATE POLICY "Admin/owner manage tenant_config"
  ON public.tenant_config
  FOR ALL TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

-- RLS: authenticated can read own tenant config
CREATE POLICY "Authenticated read tenant_config"
  ON public.tenant_config
  FOR SELECT TO authenticated
  USING (true);

-- 2. Tenant Rules table (business rules per tenant)
CREATE TABLE public.tenant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  rule_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, rule_key)
);

ALTER TABLE public.tenant_rules ENABLE ROW LEVEL SECURITY;

-- RLS: tenant isolation
CREATE POLICY "Tenant isolation tenant_rules"
  ON public.tenant_rules AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (get_user_role() = 'super_admin' OR tenant_id = get_user_tenant_id())
  WITH CHECK (get_user_role() = 'super_admin' OR tenant_id = get_user_tenant_id());

-- RLS: admin/owner manage
CREATE POLICY "Admin/owner manage tenant_rules"
  ON public.tenant_rules
  FOR ALL TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

-- RLS: authenticated read
CREATE POLICY "Authenticated read tenant_rules"
  ON public.tenant_rules
  FOR SELECT TO authenticated
  USING (true);

-- 3. Storage bucket for tenant assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: public read
CREATE POLICY "Public read tenant-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-assets');

-- Storage RLS: admin upload (folder = tenant_id)
CREATE POLICY "Admin upload tenant-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (is_admin_or_owner() OR get_user_role() = 'super_admin')
  );

CREATE POLICY "Admin update tenant-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (is_admin_or_owner() OR get_user_role() = 'super_admin')
  );

CREATE POLICY "Admin delete tenant-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (is_admin_or_owner() OR get_user_role() = 'super_admin')
  );

-- 4. Indexes
CREATE INDEX idx_tenant_config_tenant ON public.tenant_config(tenant_id);
CREATE INDEX idx_tenant_rules_tenant ON public.tenant_rules(tenant_id);
CREATE INDEX idx_tenant_rules_key ON public.tenant_rules(tenant_id, rule_key);

-- 5. Updated_at trigger for both tables
CREATE TRIGGER update_tenant_config_updated_at
  BEFORE UPDATE ON public.tenant_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_rules_updated_at
  BEFORE UPDATE ON public.tenant_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed default config for existing tenant
INSERT INTO public.tenant_config (tenant_id, display_name, display_name_bn, primary_color, secondary_color, accent_color)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Ekta Finance',
  'একতা ফাইন্যান্স',
  '#004c4d',
  '#ffd900',
  '#059669'
);

-- 7. Seed default business rules for existing tenant
INSERT INTO public.tenant_rules (tenant_id, rule_key, rule_value, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'dps_interest_rate', '10'::jsonb, 'DPS interest rate (%)'),
  ('00000000-0000-0000-0000-000000000001', 'penalty_late_fee_rate', '2'::jsonb, 'Late fee penalty rate (%)'),
  ('00000000-0000-0000-0000-000000000001', 'min_loan_amount', '5000'::jsonb, 'Minimum loan amount (BDT)'),
  ('00000000-0000-0000-0000-000000000001', 'max_loan_amount', '500000'::jsonb, 'Maximum loan amount (BDT)'),
  ('00000000-0000-0000-0000-000000000001', 'approval_workflow', '"maker_checker"'::jsonb, 'Approval workflow type'),
  ('00000000-0000-0000-0000-000000000001', 'grace_period_days', '5'::jsonb, 'Grace period before penalty (days)'),
  ('00000000-0000-0000-0000-000000000001', 'defaulter_threshold_days', '30'::jsonb, 'Days overdue to mark as defaulter');

-- 8. RPC to upsert tenant config (branding)
CREATE OR REPLACE FUNCTION public.upsert_tenant_config(
  p_display_name text DEFAULT NULL,
  p_display_name_bn text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_header_bg_url text DEFAULT NULL,
  p_primary_color text DEFAULT NULL,
  p_secondary_color text DEFAULT NULL,
  p_accent_color text DEFAULT NULL,
  p_footer_text text DEFAULT NULL,
  p_sms_sender_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.tenant_config (tenant_id)
  VALUES (v_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.tenant_config SET
    display_name = COALESCE(p_display_name, display_name),
    display_name_bn = COALESCE(p_display_name_bn, display_name_bn),
    logo_url = COALESCE(p_logo_url, logo_url),
    header_bg_url = COALESCE(p_header_bg_url, header_bg_url),
    primary_color = COALESCE(p_primary_color, primary_color),
    secondary_color = COALESCE(p_secondary_color, secondary_color),
    accent_color = COALESCE(p_accent_color, accent_color),
    footer_text = COALESCE(p_footer_text, footer_text),
    sms_sender_name = COALESCE(p_sms_sender_name, sms_sender_name),
    updated_at = now()
  WHERE tenant_id = v_tenant_id;
END;
$$;

-- 9. RPC to upsert tenant rule
CREATE OR REPLACE FUNCTION public.upsert_tenant_rule(
  p_rule_key text,
  p_rule_value jsonb,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.tenant_rules (tenant_id, rule_key, rule_value, description)
  VALUES (v_tenant_id, p_rule_key, p_rule_value, p_description)
  ON CONFLICT (tenant_id, rule_key) DO UPDATE
    SET rule_value = EXCLUDED.rule_value,
        description = COALESCE(EXCLUDED.description, public.tenant_rules.description),
        updated_at = now();
END;
$$;
