-- ============================================================
-- ROLE SYSTEM HARDENING — admin helpers + assign/revoke RPCs
-- Surgical: does NOT touch existing approval/execution engine
-- ============================================================

-- 1) Ensure super_admin exists in enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname='app_role')
      AND enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- 2) is_admin_user() — true for admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
END;
$$;

ALTER FUNCTION public.is_admin_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- 3) assign_role — admin/super_admin only
CREATE OR REPLACE FUNCTION public.assign_role(p_user_id uuid, p_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'user_id and role are required';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES (
    'role_assigned',
    'user_role',
    p_user_id,
    v_actor,
    jsonb_build_object('role', p_role::text)
  );

  RETURN jsonb_build_object('status', 'OK', 'user_id', p_user_id, 'role', p_role::text);
END;
$$;

ALTER FUNCTION public.assign_role(uuid, public.app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role(uuid, public.app_role) TO authenticated;

-- 4) revoke_role — admin/super_admin only
CREATE OR REPLACE FUNCTION public.revoke_role(p_user_id uuid, p_role public.app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_deleted int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admins can revoke roles';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'user_id and role are required';
  END IF;

  -- Prevent self-lockout: an admin cannot revoke their own admin/super_admin role
  IF p_user_id = v_actor AND p_role IN ('admin'::public.app_role, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Cannot revoke your own admin role';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = p_role;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES (
    'role_revoked',
    'user_role',
    p_user_id,
    v_actor,
    jsonb_build_object('role', p_role::text, 'deleted', v_deleted)
  );

  RETURN jsonb_build_object('status', 'OK', 'deleted', v_deleted);
END;
$$;

ALTER FUNCTION public.revoke_role(uuid, public.app_role) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role) TO authenticated;