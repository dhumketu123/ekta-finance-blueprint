
-- System settings table for gateway config and other app-wide settings
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admin/owner can read and manage settings
CREATE POLICY "Admin/owner full access system_settings"
  ON public.system_settings AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "Treasurer view system_settings"
  ON public.system_settings AS RESTRICTIVE FOR SELECT
  TO authenticated
  USING (is_treasurer());

-- Insert default SMS gateway config
INSERT INTO public.system_settings (setting_key, setting_value) VALUES
('sms_gateway', '{"mode": "api", "webhook_url": "", "active": true}'::jsonb);

-- Update timestamp trigger
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
