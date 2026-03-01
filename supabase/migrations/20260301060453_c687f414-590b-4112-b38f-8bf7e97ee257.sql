
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE profiles SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE clients SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE loans SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE savings_accounts SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
    UPDATE investors SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;
