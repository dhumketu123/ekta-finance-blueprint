CREATE OR REPLACE FUNCTION public.write_execution_audit(
  p_request_id uuid,
  p_entity_type text,
  p_action text,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.execution_audit_log(
    request_id,
    entity_type,
    action_type,
    success,
    error_message
  )
  VALUES (
    p_request_id,
    p_entity_type,
    p_action,
    p_success,
    p_error
  );
END;
$$;

ALTER FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) TO authenticated;