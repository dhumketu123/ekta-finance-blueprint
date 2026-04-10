
-- 1. TRUTH AUTHORITY REGISTRY
CREATE TABLE IF NOT EXISTS public.truth_authority_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  entity_schema text NOT NULL,
  structural_hash text NOT NULL,
  behavioral_hash text,
  authority_source text NOT NULL,
  verification_level text DEFAULT 'SYSTEM_APPROVED',
  last_verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_schema, entity_name)
);

-- 2. AUDIT IMMUTABLE GUARD
CREATE TABLE IF NOT EXISTS public.audit_control_plane (
  id text PRIMARY KEY DEFAULT 'GLOBAL',
  freeze_state boolean DEFAULT false,
  freeze_reason text,
  emergency_override boolean DEFAULT false,
  overridden_by text,
  updated_at timestamptz DEFAULT now()
);

-- 3. BOOTSTRAP TRUST SEED
CREATE OR REPLACE FUNCTION public.fn_bootstrap_truth_authority()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_control_plane (id)
  VALUES ('GLOBAL')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.truth_authority_registry (
    entity_type, entity_name, entity_schema,
    structural_hash, behavioral_hash,
    authority_source, verification_level
  )
  SELECT
    entity_type, entity_name, entity_schema,
    entity_hash, behavioral_signature,
    'BOOTSTRAP_SYSTEM', 'SYSTEM_APPROVED'
  FROM public.audit_verification_state
  ON CONFLICT DO NOTHING;
END;
$$;

-- 4. GLOBAL AUDIT SAFETY WRAPPER
CREATE OR REPLACE FUNCTION public.fn_safe_audit_guard()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_state record;
BEGIN
  SELECT * INTO v_state
  FROM public.audit_control_plane
  WHERE id = 'GLOBAL';

  IF v_state.freeze_state = true THEN
    RETURN false;
  END IF;

  IF v_state.emergency_override = true THEN
    RETURN true;
  END IF;

  RETURN true;
END;
$$;
