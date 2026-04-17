-- ============================================================
-- 1. STALE LOCK CLEANUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_execution_locks()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.execution_lock
  WHERE expires_at < now();
END;
$$;

ALTER FUNCTION public.cleanup_stale_execution_locks() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_stale_execution_locks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_execution_locks() TO authenticated;

-- ============================================================
-- 2. CRON JOB (every 5 minutes)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('execution_lock_cleanup_job');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'execution_lock_cleanup_job',
  '*/5 * * * *',
  $$SELECT public.cleanup_stale_execution_locks();$$
);

-- ============================================================
-- 3. CENTRAL AUDIT WRITER (drop & recreate to rename parameter)
-- ============================================================
DROP FUNCTION IF EXISTS public.write_execution_audit(uuid, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.write_execution_audit(
  p_request_id uuid,
  p_entity_type text,
  p_action_type text,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
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
    p_action_type,
    p_success,
    p_error
  );
END;
$$;

ALTER FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) TO authenticated;