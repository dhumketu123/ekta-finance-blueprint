
-- STEP 1: Upgrade create_notification() with idempotency
CREATE OR REPLACE FUNCTION public.create_notification(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text,
  p_source_module text,
  p_event_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'LOW',
  p_action_payload jsonb DEFAULT '{}'::jsonb,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_event_hash text;
  v_id uuid;
BEGIN
  IF p_reference IS NOT NULL THEN
    v_event_hash := public.generate_event_hash(
      p_user_id,
      p_event_type,
      p_source_module,
      p_reference
    );
  END IF;

  INSERT INTO public.in_app_notifications(
    tenant_id, user_id, role, source_module, event_type,
    title, message, priority, action_payload, event_hash
  )
  VALUES (
    p_tenant_id, p_user_id, p_role, p_source_module, p_event_type,
    p_title, p_message, p_priority, p_action_payload, v_event_hash
  )
  ON CONFLICT (event_hash) WHERE event_hash IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- STEP 2: mark_notification_read()
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.in_app_notifications
  SET is_read = true
  WHERE id = p_id
  AND user_id = auth.uid();
END;
$$;

-- STEP 3: archive_notification()
CREATE OR REPLACE FUNCTION public.archive_notification(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.in_app_notifications
  SET is_archived = true
  WHERE id = p_id
  AND user_id = auth.uid();
END;
$$;

-- STEP 4: mark_all_notifications_read()
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.in_app_notifications
  SET is_read = true
  WHERE user_id = auth.uid()
  AND is_read = false
  AND is_archived = false;
END;
$$;
