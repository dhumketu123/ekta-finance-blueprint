CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Step 1: Try JWT claim first (fastest)
  BEGIN
    v_tenant_id := (current_setting('request.jwt.claims', true)::json ->> 'tenant_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tenant_id := NULL;
  END;
  
  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- Step 2: Fallback to profiles table (bypasses RLS via SECURITY DEFINER)
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Step 3: If still NULL, auto-resolve
  IF v_tenant_id IS NULL THEN
    v_tenant_id := public.auto_resolve_user_tenant();
  END IF;

  RETURN v_tenant_id;
END;
$$;