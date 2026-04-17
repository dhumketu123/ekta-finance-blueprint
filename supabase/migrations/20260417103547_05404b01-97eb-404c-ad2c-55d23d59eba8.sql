CREATE OR REPLACE FUNCTION public.can_retry_execution(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.approval_requests
  WHERE id = p_request_id;

  RETURN v_status = 'EXECUTION_FAILED';
END;
$$;

ALTER FUNCTION public.can_retry_execution(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_retry_execution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_retry_execution(uuid) TO authenticated;