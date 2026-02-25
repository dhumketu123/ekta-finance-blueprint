
-- Fix: Add WITH CHECK to existing ALL policy for system_settings
DROP POLICY "Admin/owner full access system_settings" ON public.system_settings;

CREATE POLICY "Admin/owner full access system_settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (is_admin_or_owner())
WITH CHECK (is_admin_or_owner());
