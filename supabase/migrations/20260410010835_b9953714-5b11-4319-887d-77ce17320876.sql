
CREATE OR REPLACE FUNCTION public.fn_log_anomaly_master(
  p_entity text,
  p_category text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_root text;
BEGIN
  v_root := p_category || ':' || p_entity;
  PERFORM public.fn_dedupe_anomaly(v_root, p_category);
END;
$$;
