
-- 0️⃣ Create digest_queue table
CREATE TABLE IF NOT EXISTS public.digest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  priority text NOT NULL DEFAULT 'LOW',
  scheduled_at timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digest_queue_user_pending
  ON public.digest_queue(user_id)
  WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_digest_queue_scheduled
  ON public.digest_queue(scheduled_at)
  WHERE processed = false;

ALTER TABLE public.digest_queue ENABLE ROW LEVEL SECURITY;

-- Block direct access; only SECURITY DEFINER functions can write
CREATE POLICY "Block direct insert digest_queue"
  ON public.digest_queue FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update digest_queue"
  ON public.digest_queue FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Block direct delete digest_queue"
  ON public.digest_queue FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "Admin view digest_queue"
  ON public.digest_queue FOR SELECT TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "Users view own digest_queue"
  ON public.digest_queue FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.digest_queue FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.digest_queue FROM anon;

-- 1️⃣ WebSocket Bell Notification
CREATE OR REPLACE FUNCTION public.notify_user_bell(
  p_user_id uuid, p_id uuid, p_title text, p_message text, p_priority text
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
      'id', p_id,
      'title', p_title,
      'message', p_message,
      'priority', p_priority,
      'timestamp', now()
    )::text
  );
END;
$$;

-- 2️⃣ Push Notification placeholder
CREATE OR REPLACE FUNCTION public.send_push_notification(
  p_user_id uuid, p_id uuid, p_title text, p_message text,
  p_action_payload jsonb, p_priority text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE NOTICE '[Push] user=% notification=% priority=%', p_user_id, p_id, p_priority;
END;
$$;

-- 3️⃣ Dashboard Critical Strip
CREATE OR REPLACE FUNCTION public.notify_dashboard_strip(
  p_id uuid, p_title text, p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM pg_notify(
    'dashboard_strip',
    json_build_object(
      'id', p_id,
      'title', p_title,
      'message', p_message,
      'timestamp', now()
    )::text
  );
END;
$$;

-- 4️⃣ Digest Queue Enqueue
CREATE OR REPLACE FUNCTION public.enqueue_digest(
  p_id uuid, p_user_id uuid, p_priority text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF p_priority IN ('LOW', 'MEDIUM') THEN
    INSERT INTO public.digest_queue(notification_id, user_id, priority, scheduled_at)
    VALUES (p_id, p_user_id, p_priority, now() + interval '1 day')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- 5️⃣ Notification Dispatcher
CREATE OR REPLACE FUNCTION public.dispatch_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  notif record;
BEGIN
  SELECT * INTO notif
  FROM public.in_app_notifications
  WHERE id = p_notification_id;

  IF notif IS NULL THEN
    RAISE NOTICE 'Notification not found: %', p_notification_id;
    RETURN;
  END IF;

  -- Bell (WebSocket)
  PERFORM public.notify_user_bell(notif.user_id, notif.id, notif.title, notif.message, notif.priority);

  -- Push (placeholder)
  PERFORM public.send_push_notification(notif.user_id, notif.id, notif.title, notif.message, notif.action_payload, notif.priority);

  -- Dashboard strip for HIGH priority
  IF notif.priority = 'HIGH' THEN
    PERFORM public.notify_dashboard_strip(notif.id, notif.title, notif.message);
  END IF;

  -- Digest queue for LOW/MEDIUM
  PERFORM public.enqueue_digest(notif.id, notif.user_id, notif.priority);
END;
$$;

-- 6️⃣ Auto-dispatch trigger
CREATE OR REPLACE FUNCTION public.trigger_dispatch_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.dispatch_notification(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_notification ON public.in_app_notifications;

CREATE TRIGGER trg_dispatch_notification
  AFTER INSERT ON public.in_app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_dispatch_notification();
