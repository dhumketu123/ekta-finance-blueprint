DO $$
DECLARE
  v_jobid bigint;
  v_cron_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  IF v_cron_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET not found in vault — skipping pg_cron rewire.';
    RETURN;
  END IF;

  -- Drop ALL existing schedules pointing at these two functions
  FOR v_jobid IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%/functions/v1/daily-cron%'
       OR command ILIKE '%/functions/v1/monthly-investor-profit%'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  -- daily-cron @ 00:05 Asia/Dhaka (18:05 UTC) — x-cron-secret only
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

  -- monthly-investor-profit on 1st of month 01:00 Asia/Dhaka — x-cron-secret only
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