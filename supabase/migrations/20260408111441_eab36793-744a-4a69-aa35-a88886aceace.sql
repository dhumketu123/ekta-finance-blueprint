REVOKE ALL ON public.ai_system_health_mat FROM anon;
REVOKE ALL ON public.ai_system_health_mat FROM authenticated;
GRANT SELECT ON public.ai_system_health_mat TO authenticated;
GRANT ALL ON public.ai_system_health_mat TO service_role;