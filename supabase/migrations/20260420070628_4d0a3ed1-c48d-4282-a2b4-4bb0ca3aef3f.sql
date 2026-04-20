-- ════════════════════════════════════════════════════════════════
-- CRON Hardening: idempotency log + vault secret reader
-- ════════════════════════════════════════════════════════════════

-- 1) Idempotency table
CREATE TABLE IF NOT EXISTS public.cron_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  execution_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','success','failed','dry_run')),
  dry_run boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cron_execution_log_job_time
  ON public.cron_execution_log (job_name, executed_at DESC);

ALTER TABLE public.cron_execution_log ENABLE ROW LEVEL SECURITY;

-- Only admins/owners may read
DROP POLICY IF EXISTS "Admins view cron execution log" ON public.cron_execution_log;
CREATE POLICY "Admins view cron execution log"
  ON public.cron_execution_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

-- No client writes; only service_role / SECURITY DEFINER functions write.
DROP POLICY IF EXISTS "No client writes to cron execution log" ON public.cron_execution_log;
CREATE POLICY "No client writes to cron execution log"
  ON public.cron_execution_log
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- 2) Atomic claim function — returns 'claimed' first time, 'already_executed' otherwise.
CREATE OR REPLACE FUNCTION public.claim_cron_execution(
  p_job_name text,
  p_execution_key text,
  p_dry_run boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing record;
BEGIN
  -- Dry-runs never write the lock — they only simulate.
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'claimed', true,
      'dry_run', true,
      'execution_key', p_execution_key
    );
  END IF;

  BEGIN
    INSERT INTO public.cron_execution_log(job_name, execution_key, status, dry_run, metadata)
    VALUES (p_job_name, p_execution_key, 'claimed', false, COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
      'claimed', true,
      'dry_run', false,
      'execution_id', v_id,
      'execution_key', p_execution_key
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT id, status, executed_at INTO v_existing
    FROM public.cron_execution_log
    WHERE execution_key = p_execution_key
    LIMIT 1;

    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'already_executed',
      'execution_id', v_existing.id,
      'previous_status', v_existing.status,
      'previous_executed_at', v_existing.executed_at,
      'execution_key', p_execution_key
    );
  END;
END;
$$;

-- 3) Mark completion (success / failure)
CREATE OR REPLACE FUNCTION public.complete_cron_execution(
  p_execution_key text,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cron_execution_log
  SET status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
      error_message = p_error,
      metadata = COALESCE(p_metadata, metadata),
      completed_at = now()
  WHERE execution_key = p_execution_key;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cron_execution(text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_cron_execution(text, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_execution(text, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_cron_execution(text, boolean, text, jsonb) TO service_role;

-- 4) Vault reader — only callable by service_role (edge functions)
CREATE OR REPLACE FUNCTION public.get_cron_secret_from_vault()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_secret_from_vault() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret_from_vault() TO service_role;