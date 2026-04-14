
-- =============================================
-- 1. Ensure get_user_tenant_id() is STABLE
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- =============================================
-- 2. Event-driven webhook trigger for knowledge sync
-- =============================================

-- Ensure pg_net is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function that fires async HTTP to knowledge-sync
CREATE OR REPLACE FUNCTION public.notify_knowledge_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _anon_key text;
BEGIN
  -- Build the edge function URL from project config
  SELECT decrypted_secret INTO _anon_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_ANON_KEY'
    LIMIT 1;

  -- Fallback: use hardcoded project ref if vault unavailable
  _url := 'https://fjyhblhlfbmuyfiffynv.supabase.co/functions/v1/knowledge-sync';

  -- Fire async (non-blocking) HTTP POST via pg_net
  PERFORM extensions.http_post(
    url := _url,
    body := jsonb_build_object(
      'trigger_table', TG_TABLE_NAME,
      'trigger_op', TG_OP,
      'triggered_at', now()::text
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_anon_key, '')
    )
  );

  RETURN NULL; -- AFTER trigger, return is ignored
EXCEPTION WHEN OTHERS THEN
  -- Never block DML operations due to sync failure
  RAISE WARNING 'knowledge_sync webhook failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Attach to critical tables (AFTER trigger, statement-level to avoid per-row overhead)
DO $$
DECLARE
  _tables text[] := ARRAY['profiles', 'financial_transactions', 'commitments', 'loans', 'clients', 'investors', 'savings_accounts'];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables
  LOOP
    -- Drop existing if any
    EXECUTE format('DROP TRIGGER IF EXISTS trg_knowledge_sync_webhook ON public.%I', _t);
    -- Create debounced statement-level trigger
    EXECUTE format(
      'CREATE TRIGGER trg_knowledge_sync_webhook
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH STATEMENT
       EXECUTE FUNCTION public.notify_knowledge_sync()', _t
    );
  END LOOP;
END;
$$;
