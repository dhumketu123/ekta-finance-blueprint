
-- Fix security definer views → set to SECURITY INVOKER
ALTER VIEW public.view_swipe_success_rate SET (security_invoker = on);
ALTER VIEW public.view_reschedule_rate SET (security_invoker = on);
ALTER VIEW public.view_ai_chip_usage SET (security_invoker = on);
ALTER VIEW public.view_officer_performance_summary SET (security_invoker = on);
