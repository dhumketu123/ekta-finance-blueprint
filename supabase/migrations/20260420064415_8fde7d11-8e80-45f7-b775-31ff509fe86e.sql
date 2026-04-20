-- Update pg_cron schedules for daily-cron and monthly-investor-profit
-- to send the x-cron-secret header so the hardened edge functions accept them.

DO $$
DECLARE
  v_jobid bigint;
  v_cron_secret text;
BEGIN
  -- Pull CRON_SECRET from Vault if present; fallback to a placeholder we never use
  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  IF v_cron_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET not in vault.decrypted_secrets — skipping pg_cron rewire. Reschedule manually via SQL once secret is mirrored to Vault.';
    RETURN;
  END IF;

  -- Unschedule existing daily-cron jobs
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%/functions/v1/daily-cron%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  -- Unschedule existing monthly-investor-profit jobs
  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE command ILIKE '%/functions/v1/monthly-investor-profit%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  -- Reschedule daily-cron at 00:05 Asia/Dhaka (18:05 UTC) with x-cron-secret
  PERFORM cron.schedule(
    'daily-cron-secured',
    '5 18 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://fjyhblhlfbmuyfiffynv.supabase.co/functions/v1/daily-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := jsonb_build_object('triggered_at', now())
      );
    $cmd$, v_cron_secret)
  );

  -- Reschedule monthly-investor-profit on 1st of month at 01:00 Asia/Dhaka (19:00 UTC prev day)
  PERFORM cron.schedule(
    'monthly-investor-profit-secured',
    '0 19 28-31 * *',
    format($cmd$
      SELECT CASE WHEN (now() AT TIME ZONE 'Asia/Dhaka')::date = date_trunc('month', (now() AT TIME ZONE 'Asia/Dhaka') + interval '1 day')::date
        THEN net.http_post(
          url := 'https://fjyhblhlfbmuyfiffynv.supabase.co/functions/v1/monthly-investor-profit',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', %L
          ),
          body := jsonb_build_object('triggered_at', now())
        )::text
        ELSE 'skip'
      END;
    $cmd$, v_cron_secret)
  );
END $$;