
CREATE OR REPLACE FUNCTION public.secure_delete_owner(_owner_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
  _target_role text;
BEGIN
  -- 1. Verify caller is super_admin
  _caller_role := get_user_role();
  IF _caller_role IS DISTINCT FROM 'super_admin' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Access denied: super_admin role required');
  END IF;

  -- 2. Verify target user exists in profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _owner_user_id) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Owner profile not found');
  END IF;

  -- 3. Verify target has owner role
  SELECT role INTO _target_role FROM public.user_roles WHERE user_id = _owner_user_id AND role = 'owner';
  IF _target_role IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Target user does not have owner role');
  END IF;

  -- 4. Delete related data that may have FK constraints
  -- Delete owner profit shares
  DELETE FROM public.owner_profit_shares WHERE owner_id = _owner_user_id;

  -- Delete user roles
  DELETE FROM public.user_roles WHERE user_id = _owner_user_id;

  -- Delete profile (will be cascaded by auth.users deletion too, but explicit for clarity)
  DELETE FROM public.profiles WHERE id = _owner_user_id;

  -- 5. Delete from auth.users (cascades to any remaining FK references)
  DELETE FROM auth.users WHERE id = _owner_user_id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Owner permanently deleted');

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Cannot delete: Please clear this owner''s test transactions and related data first.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Deletion failed: ' || SQLERRM
    );
END;
$$;
