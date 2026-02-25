
-- Create a SECURITY DEFINER function to safely upsert system_settings
-- This bypasses RLS so authenticated admin/field_officer users can save configs
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
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Upsert the setting
  INSERT INTO public.system_settings (setting_key, setting_value, updated_by)
  VALUES (p_setting_key, p_setting_value, v_user_id)
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_system_setting(text, jsonb) TO authenticated;
