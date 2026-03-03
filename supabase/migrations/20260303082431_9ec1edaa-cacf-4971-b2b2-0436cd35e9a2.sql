
-- STEP 1: Drop and recreate RLS policy (keep super_admin for operational needs)
DROP POLICY IF EXISTS "Tenant isolation clients" ON clients;

CREATE POLICY "Tenant isolation clients"
ON clients
FOR ALL
USING (
  (get_user_role() = 'super_admin'::text) OR (tenant_id = get_user_tenant_id())
)
WITH CHECK (
  (get_user_role() = 'super_admin'::text) OR (tenant_id = get_user_tenant_id())
);

-- STEP 2: Create SECURITY DEFINER RPC for secure client creation
-- Accepts JSONB so all client fields are supported without a rigid parameter list
CREATE OR REPLACE FUNCTION public.create_client_secure(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_result_id uuid;
BEGIN
  -- Resolve tenant from JWT/profile
  v_tenant_id := get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context not found for current user';
  END IF;

  INSERT INTO clients (
    name_en, name_bn, phone, area, status,
    father_or_husband_name, mother_name, nid_number,
    date_of_birth, marital_status, occupation,
    village, post_office, union_name, upazila, district,
    nominee_name, nominee_relation, nominee_phone, nominee_nid,
    tenant_id
  ) VALUES (
    p_data->>'name_en',
    COALESCE(p_data->>'name_bn', ''),
    NULLIF(p_data->>'phone', ''),
    NULLIF(p_data->>'area', ''),
    COALESCE((p_data->>'status')::client_status, 'active'),
    NULLIF(p_data->>'father_or_husband_name', ''),
    NULLIF(p_data->>'mother_name', ''),
    NULLIF(p_data->>'nid_number', ''),
    NULLIF(p_data->>'date_of_birth', '')::date,
    NULLIF(p_data->>'marital_status', ''),
    NULLIF(p_data->>'occupation', ''),
    NULLIF(p_data->>'village', ''),
    NULLIF(p_data->>'post_office', ''),
    NULLIF(p_data->>'union_name', ''),
    NULLIF(p_data->>'upazila', ''),
    NULLIF(p_data->>'district', ''),
    NULLIF(p_data->>'nominee_name', ''),
    NULLIF(p_data->>'nominee_relation', ''),
    NULLIF(p_data->>'nominee_phone', ''),
    NULLIF(p_data->>'nominee_nid', ''),
    v_tenant_id
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

-- STEP 3: Create SECURITY DEFINER RPC for secure client update
CREATE OR REPLACE FUNCTION public.update_client_secure(p_id uuid, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context not found for current user';
  END IF;

  UPDATE clients SET
    name_en = COALESCE(p_data->>'name_en', name_en),
    name_bn = COALESCE(p_data->>'name_bn', name_bn),
    phone = NULLIF(p_data->>'phone', ''),
    area = NULLIF(p_data->>'area', ''),
    status = COALESCE((p_data->>'status')::client_status, status),
    father_or_husband_name = NULLIF(p_data->>'father_or_husband_name', ''),
    mother_name = NULLIF(p_data->>'mother_name', ''),
    nid_number = NULLIF(p_data->>'nid_number', ''),
    date_of_birth = NULLIF(p_data->>'date_of_birth', '')::date,
    marital_status = NULLIF(p_data->>'marital_status', ''),
    occupation = NULLIF(p_data->>'occupation', ''),
    village = NULLIF(p_data->>'village', ''),
    post_office = NULLIF(p_data->>'post_office', ''),
    union_name = NULLIF(p_data->>'union_name', ''),
    upazila = NULLIF(p_data->>'upazila', ''),
    district = NULLIF(p_data->>'district', ''),
    nominee_name = NULLIF(p_data->>'nominee_name', ''),
    nominee_relation = NULLIF(p_data->>'nominee_relation', ''),
    nominee_phone = NULLIF(p_data->>'nominee_phone', ''),
    nominee_nid = NULLIF(p_data->>'nominee_nid', ''),
    updated_at = now()
  WHERE id = p_id AND tenant_id = v_tenant_id;
END;
$$;

-- STEP 4: Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_client_secure(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_secure(uuid, jsonb) TO authenticated;
