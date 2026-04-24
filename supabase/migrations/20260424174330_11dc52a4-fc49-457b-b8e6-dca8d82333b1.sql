-- =========================================================
-- 1. FREEZE CONTRACT INSERT PATH (TRUE IMMUTABILITY)
-- =========================================================
REVOKE INSERT ON public.financial_event_contract FROM authenticated;
REVOKE INSERT ON public.financial_event_contract FROM anon;
REVOKE INSERT ON public.financial_event_contract FROM service_role;

-- =========================================================
-- 2. EVENT REGISTRY LAYER (STANDARDIZATION)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.financial_event_registry (
  event_type TEXT PRIMARY KEY,
  version INT DEFAULT 1,
  description TEXT,
  payload_schema JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_event_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registry_read_all" ON public.financial_event_registry;
CREATE POLICY "registry_read_all"
ON public.financial_event_registry
FOR SELECT
TO authenticated
USING (true);

-- Backfill registry from existing contract to guarantee zero-gap on first run
INSERT INTO public.financial_event_registry (event_type, version, description, is_active)
SELECT DISTINCT c.event_type, 1, c.description, c.is_active
FROM public.financial_event_contract c
ON CONFLICT (event_type) DO NOTHING;

-- =========================================================
-- 3. CONTRACT + REGISTRY SYNC VALIDATOR
-- =========================================================
CREATE OR REPLACE FUNCTION public.validate_event_system_integrity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v INT;
BEGIN
  SELECT COUNT(*) INTO v
  FROM public.financial_event_contract c
  LEFT JOIN public.financial_event_registry r
    ON c.event_type = r.event_type
  WHERE r.event_type IS NULL;

  IF v > 0 THEN
    RAISE EXCEPTION 'EVENT REGISTRY GAP DETECTED (%)', v;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_event_system_integrity() TO authenticated, service_role;

-- =========================================================
-- 4. SYSTEM READINESS CHECK
-- =========================================================
CREATE OR REPLACE FUNCTION public.system_readiness_check()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract INT;
  v_registry INT;
BEGIN
  SELECT COUNT(*) INTO v_contract FROM public.financial_event_contract;
  SELECT COUNT(*) INTO v_registry FROM public.financial_event_registry;

  RETURN jsonb_build_object(
    'contract_rows', v_contract,
    'registry_rows', v_registry,
    'status',
    CASE
      WHEN v_contract > 0 AND v_registry > 0 THEN 'PRODUCTION_READY'
      ELSE 'INCOMPLETE'
    END,
    'checked_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.system_readiness_check() TO authenticated, service_role;

-- =========================================================
-- 5. FINAL EXECUTION CHECK (FAIL FAST)
-- =========================================================
SELECT public.validate_event_system_integrity();
SELECT public.system_readiness_check();