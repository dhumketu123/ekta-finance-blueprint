ALTER TABLE public.execution_lock
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.cleanup_stale_execution_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.execution_lock
  WHERE expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

ALTER FUNCTION public.cleanup_stale_execution_locks() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_stale_execution_locks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_execution_locks() TO authenticated;