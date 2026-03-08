
CREATE OR REPLACE FUNCTION public.auto_resolve_user_tenant()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_default_tenant_id uuid;
BEGIN
  -- 1. Get current user's tenant_id
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = v_uid;

  -- 2. If tenant_id is NOT NULL, return it immediately
  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- 3. If NULL, find the first available tenant
  SELECT id INTO v_default_tenant_id FROM public.tenants ORDER BY created_at ASC LIMIT 1;

  -- 4. If no tenants exist, INSERT a default tenant
  IF v_default_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, created_at)
    VALUES ('Ekta Finance Group', NOW())
    RETURNING id INTO v_default_tenant_id;
  END IF;

  -- 5. UPDATE profiles with resolved tenant_id
  UPDATE public.profiles
  SET tenant_id = v_default_tenant_id, updated_at = NOW()
  WHERE id = v_uid;

  -- 6. Return the resolved tenant_id
  RETURN v_default_tenant_id;
END;
$$;
