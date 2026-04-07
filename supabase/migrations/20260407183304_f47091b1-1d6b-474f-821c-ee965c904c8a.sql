
-- Drop old global indexes FIRST
DROP INDEX IF EXISTS public.clients_canonical_phone_unique;
DROP INDEX IF EXISTS public.investors_canonical_phone_unique;

-- STEP 1: True canonical backfill
UPDATE public.clients
SET canonical_phone = regexp_replace(phone, '[^0-9]', '', 'g')
WHERE canonical_phone IS NULL AND phone IS NOT NULL;

UPDATE public.investors
SET canonical_phone = regexp_replace(phone, '[^0-9]', '', 'g')
WHERE canonical_phone IS NULL AND phone IS NOT NULL;

-- Normalize 880 prefix → 0
UPDATE public.clients
SET canonical_phone =
  CASE
    WHEN canonical_phone LIKE '8801%' THEN '0' || substr(canonical_phone, 4)
    ELSE canonical_phone
  END
WHERE canonical_phone IS NOT NULL;

UPDATE public.investors
SET canonical_phone =
  CASE
    WHEN canonical_phone LIKE '8801%' THEN '0' || substr(canonical_phone, 4)
    ELSE canonical_phone
  END
WHERE canonical_phone IS NOT NULL;

-- Null out invalid phones
UPDATE public.clients SET canonical_phone = NULL
WHERE canonical_phone IS NOT NULL AND canonical_phone !~ '^01[0-9]{9}$';

UPDATE public.investors SET canonical_phone = NULL
WHERE canonical_phone IS NOT NULL AND canonical_phone !~ '^01[0-9]{9}$';

-- Deduplicate within tenant (keep newest)
UPDATE public.clients SET canonical_phone = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id, canonical_phone ORDER BY created_at DESC) AS rn
    FROM public.clients
    WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL
  ) sub WHERE rn > 1
);

UPDATE public.investors SET canonical_phone = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id, canonical_phone ORDER BY created_at DESC) AS rn
    FROM public.investors
    WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL
  ) sub WHERE rn > 1
);

-- STEP 2: Tenant-scoped unique indexes
CREATE UNIQUE INDEX clients_canonical_phone_tenant_unique
ON public.clients (tenant_id, canonical_phone)
WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX investors_canonical_phone_tenant_unique
ON public.investors (tenant_id, canonical_phone)
WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL;

-- STEP 3: Validation trigger
CREATE OR REPLACE FUNCTION public.validate_canonical_phone()
RETURNS trigger AS $$
BEGIN
  IF NEW.canonical_phone IS NOT NULL AND NEW.canonical_phone !~ '^01[0-9]{9}$' THEN
    RAISE EXCEPTION 'Invalid phone format: must be 01XXXXXXXXX (11 digits)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_client_phone
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.validate_canonical_phone();

CREATE TRIGGER trg_validate_investor_phone
BEFORE INSERT OR UPDATE ON public.investors
FOR EACH ROW EXECUTE FUNCTION public.validate_canonical_phone();

-- STEP 4: Cross-role guard trigger
CREATE OR REPLACE FUNCTION public.prevent_cross_role_duplicate()
RETURNS trigger AS $$
BEGIN
  IF NEW.canonical_phone IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'clients' THEN
    IF EXISTS (
      SELECT 1 FROM public.investors
      WHERE tenant_id = NEW.tenant_id
        AND canonical_phone = NEW.canonical_phone
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Phone already exists as investor in this tenant';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'investors' THEN
    IF EXISTS (
      SELECT 1 FROM public.clients
      WHERE tenant_id = NEW.tenant_id
        AND canonical_phone = NEW.canonical_phone
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Phone already exists as client in this tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_clients_cross_role_guard
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.prevent_cross_role_duplicate();

CREATE TRIGGER trg_investors_cross_role_guard
BEFORE INSERT ON public.investors
FOR EACH ROW EXECUTE FUNCTION public.prevent_cross_role_duplicate();

-- STEP 5: Onboarding metrics table
CREATE TABLE public.onboarding_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  role text NOT NULL,
  total integer NOT NULL DEFAULT 0,
  success integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.onboarding_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner manage onboarding_metrics"
ON public.onboarding_metrics
FOR ALL
TO authenticated
USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id())
WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());
