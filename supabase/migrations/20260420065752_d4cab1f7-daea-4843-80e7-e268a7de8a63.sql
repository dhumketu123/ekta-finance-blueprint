-- Helper function: seed CRON_SECRET into vault.secrets (idempotent).
-- SECURITY DEFINER + restricted to service_role only. No anon/authenticated access.
CREATE OR REPLACE FUNCTION public.seed_cron_secret_to_vault(p_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, 'CRON_SECRET', 'CRON authentication secret used by pg_cron to call edge functions');
    RETURN 'created';
  ELSE
    PERFORM vault.update_secret(v_id, p_secret);
    RETURN 'updated';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_cron_secret_to_vault(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_cron_secret_to_vault(text) TO service_role;