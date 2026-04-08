CREATE OR REPLACE FUNCTION public.refresh_ai_system_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.ai_system_health_mat;
  END;
END;
$$;