
-- =============================================
-- 1️⃣ notification_analytics table
-- =============================================
CREATE TABLE IF NOT EXISTS public.notification_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  ignored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_analytics_user
  ON public.notification_analytics(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_analytics_notification
  ON public.notification_analytics(notification_id);

ALTER TABLE public.notification_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block direct insert notification_analytics"
  ON public.notification_analytics FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update notification_analytics"
  ON public.notification_analytics FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Block direct delete notification_analytics"
  ON public.notification_analytics FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Admin view notification_analytics"
  ON public.notification_analytics FOR SELECT TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "Users view own notification_analytics"
  ON public.notification_analytics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.notification_analytics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_analytics FROM anon;

-- =============================================
-- 2️⃣ notification_retry_queue table
-- =============================================
CREATE TABLE IF NOT EXISTS public.notification_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  last_attempt timestamptz,
  failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retry_queue_pending
  ON public.notification_retry_queue(failed, attempts)
  WHERE failed = false;

ALTER TABLE public.notification_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Block direct insert notification_retry_queue"
  ON public.notification_retry_queue FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update notification_retry_queue"
  ON public.notification_retry_queue FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Block direct delete notification_retry_queue"
  ON public.notification_retry_queue FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Admin view notification_retry_queue"
  ON public.notification_retry_queue FOR SELECT TO authenticated
  USING (is_admin_or_owner());

REVOKE INSERT, UPDATE, DELETE ON public.notification_retry_queue FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_retry_queue FROM anon;

-- =============================================
-- 3️⃣ AI Smart Priority
-- =============================================
CREATE OR REPLACE FUNCTION public.calculate_priority(p_notification_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  notif record;
  base_score int := 0;
  engagement_count int := 0;
  final_score int;
BEGIN
  SELECT * INTO notif FROM public.in_app_notifications WHERE id = p_notification_id;
  IF notif IS NULL THEN RETURN 'LOW'; END IF;

  -- Base scoring from declared priority
  IF notif.priority = 'HIGH' THEN base_score := 100;
  ELSIF notif.priority = 'MEDIUM' THEN base_score := 70;
  ELSE base_score := 40;
  END IF;

  -- Engagement influence: recent opens in last 7 days
  SELECT count(*) INTO engagement_count
  FROM public.notification_analytics
  WHERE user_id = notif.user_id
    AND opened_at IS NOT NULL
    AND created_at > now() - interval '7 days';

  -- Blend: base weighted 70%, engagement 30%
  final_score := (base_score * 7 + LEAST(engagement_count * 10, 100) * 3) / 10;

  IF final_score >= 80 THEN RETURN 'HIGH';
  ELSIF final_score >= 50 THEN RETURN 'MEDIUM';
  ELSE RETURN 'LOW';
  END IF;
END;
$$;

-- =============================================
-- 4️⃣ Digest Automation Worker
-- =============================================
CREATE OR REPLACE FUNCTION public.process_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM public.digest_queue
    WHERE processed = false AND scheduled_at <= now()
  LOOP
    PERFORM public.send_push_notification(
      item.user_id, item.notification_id,
      'Digest Notification', 'You have pending notifications',
      '{}'::jsonb, item.priority
    );
    UPDATE public.digest_queue SET processed = true WHERE id = item.id;
  END LOOP;
END;
$$;

-- =============================================
-- 5️⃣ Multi-Device Sync
-- =============================================
CREATE OR REPLACE FUNCTION public.sync_notification_status(
  p_notification_id uuid, p_user_id uuid, p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM pg_notify(
    'user_notifications_' || p_user_id::text,
    json_build_object(
      'id', p_notification_id,
      'action', p_action,
      'timestamp', now()
    )::text
  );
END;
$$;

-- =============================================
-- 6️⃣ Advanced Dispatch (replaces basic)
-- =============================================
CREATE OR REPLACE FUNCTION public.dispatch_notification_advanced(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  notif record;
  final_priority text;
BEGIN
  SELECT * INTO notif FROM public.in_app_notifications WHERE id = p_notification_id;
  IF notif IS NULL THEN RETURN; END IF;

  -- AI priority
  final_priority := public.calculate_priority(p_notification_id);

  -- Bell
  PERFORM public.notify_user_bell(notif.user_id, notif.id, notif.title, notif.message, final_priority);

  -- Push
  PERFORM public.send_push_notification(notif.user_id, notif.id, notif.title, notif.message, notif.action_payload, final_priority);

  -- Dashboard strip for HIGH
  IF final_priority = 'HIGH' THEN
    PERFORM public.notify_dashboard_strip(notif.id, notif.title, notif.message);
  END IF;

  -- Digest for LOW/MEDIUM
  IF final_priority IN ('LOW', 'MEDIUM') THEN
    PERFORM public.enqueue_digest(notif.id, notif.user_id, final_priority);
  END IF;

  -- Analytics log
  INSERT INTO public.notification_analytics(notification_id, user_id, channel, delivered_at)
  VALUES (notif.id, notif.user_id, 'dispatch', now());

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.notification_retry_queue(notification_id, user_id, channel, attempts, last_attempt)
  VALUES (notif.id, notif.user_id, 'dispatch', 1, now());
  RAISE NOTICE 'Dispatch failed, queued for retry: %', notif.id;
END;
$$;

-- =============================================
-- 7️⃣ Replace Phase 4 trigger with advanced
-- =============================================
DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.in_app_notifications;

CREATE OR REPLACE FUNCTION public.trigger_dispatch_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.dispatch_notification_advanced(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dispatch_notification
  AFTER INSERT ON public.in_app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_dispatch_notification();

-- =============================================
-- 8️⃣ Analytics Hooks
-- =============================================
CREATE OR REPLACE FUNCTION public.log_notification_open(p_notification_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.notification_analytics
  SET opened_at = now()
  WHERE notification_id = p_notification_id AND user_id = p_user_id;

  PERFORM public.sync_notification_status(p_notification_id, p_user_id, 'opened');
END;
$$;

CREATE OR REPLACE FUNCTION public.log_notification_click(p_notification_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.notification_analytics
  SET clicked_at = now()
  WHERE notification_id = p_notification_id AND user_id = p_user_id;

  PERFORM public.sync_notification_status(p_notification_id, p_user_id, 'clicked');
END;
$$;

CREATE OR REPLACE FUNCTION public.log_notification_ignore(p_notification_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.notification_analytics
  SET ignored = true
  WHERE notification_id = p_notification_id AND user_id = p_user_id;

  PERFORM public.sync_notification_status(p_notification_id, p_user_id, 'ignored');
END;
$$;
