
-- Revoke direct API access to the new materialized view
REVOKE SELECT ON public.ai_dashboard_metrics_mat FROM anon;
REVOKE SELECT ON public.ai_dashboard_metrics_mat FROM authenticated;

-- Only service_role and the refresh function (security definer) can access it
GRANT SELECT ON public.ai_dashboard_metrics_mat TO service_role;
