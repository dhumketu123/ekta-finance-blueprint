
-- ═══════════════════════════════════════════════════════════
-- STEP 1: Create in_app_notifications table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  source_module text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'LOW',
  action_payload jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Priority validation trigger (avoiding CHECK for immutability safety)
CREATE OR REPLACE FUNCTION public.validate_notification_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.priority NOT IN ('HIGH', 'MEDIUM', 'LOW') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be HIGH, MEDIUM, or LOW.', NEW.priority;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_notification_priority
  BEFORE INSERT OR UPDATE ON public.in_app_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_notification_priority();

-- Indexes
CREATE INDEX idx_in_app_notifications_user_unread
  ON public.in_app_notifications (user_id, is_read);

CREATE INDEX idx_in_app_notifications_tenant_created
  ON public.in_app_notifications (tenant_id, created_at DESC);

CREATE INDEX idx_in_app_notifications_priority
  ON public.in_app_notifications (priority);

-- ═══════════════════════════════════════════════════════════
-- STEP 2 & 3: Enable RLS + Policies
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users view own notifications
CREATE POLICY "Users view own in_app_notifications"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Admin/owner view all tenant notifications
CREATE POLICY "Admin view tenant in_app_notifications"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (
    is_admin_or_owner()
    AND tenant_id = get_user_tenant_id()
  );

-- Policy 3: Block direct inserts (only via SECURITY DEFINER function)
CREATE POLICY "Block direct insert in_app_notifications"
  ON public.in_app_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Block direct updates (mark-read will go through RPC later)
CREATE POLICY "Users update own in_app_notifications"
  ON public.in_app_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Block deletes
CREATE POLICY "Block delete in_app_notifications"
  ON public.in_app_notifications
  FOR DELETE
  TO authenticated
  USING (false);

-- ═══════════════════════════════════════════════════════════
-- STEP 4: notification_preferences table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean DEFAULT true,
  digest_enabled boolean DEFAULT false,
  muted_categories text[] DEFAULT '{}',
  reminder_time time DEFAULT '09:00',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification_preferences"
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own notification_preferences"
  ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own notification_preferences"
  ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Block delete notification_preferences"
  ON public.notification_preferences
  FOR DELETE
  TO authenticated
  USING (false);

-- ═══════════════════════════════════════════════════════════
-- STEP 5: create_notification() SECURITY DEFINER function
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_notification(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text,
  p_source_module text,
  p_event_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'LOW',
  p_action_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validate priority
  IF p_priority NOT IN ('HIGH', 'MEDIUM', 'LOW') THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be HIGH, MEDIUM, or LOW.', p_priority;
  END IF;

  INSERT INTO public.in_app_notifications (
    tenant_id, user_id, role, source_module, event_type,
    title, message, priority, action_payload
  ) VALUES (
    p_tenant_id, p_user_id, p_role, p_source_module, p_event_type,
    p_title, p_message, p_priority, p_action_payload
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
