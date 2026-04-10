
-- 1. GAP DEFINITION LOCK (IMMUTABLE REGISTRY)
CREATE TABLE IF NOT EXISTS public.gap_definition_lock (
  id text PRIMARY KEY DEFAULT 'v1.0',
  version text NOT NULL DEFAULT '1.0',
  locked_at timestamptz DEFAULT now(),
  is_locked boolean DEFAULT true,
  valid_gap_types text[] DEFAULT ARRAY[
    'broken_foreign_key',
    'missing_constraint_not_null',
    'missing_constraint_unique',
    'missing_constraint_rls',
    'unreachable_execution_path',
    'unhandled_failure_state'
  ],
  excluded_from_gap text[] DEFAULT ARRAY[
    'duplicate_trigger',
    'function_overload',
    'high_volume_anomaly',
    'version_churn',
    'observability_noise'
  ],
  audit_rules jsonb DEFAULT '{"detection_mode":"read_only","fix_mode":"separate_pipeline","definition_mode":"immutable","recursive_audit_allowed":false,"clean_entity_reclassification":false}'::jsonb
);

ALTER TABLE public.gap_definition_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view gap definitions"
ON public.gap_definition_lock
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Prevent modification of locked definitions
CREATE OR REPLACE FUNCTION public.fn_protect_gap_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked = true THEN
    RAISE EXCEPTION 'GAP Definition Lock v% is immutable and cannot be modified', OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_gap_lock ON public.gap_definition_lock;
CREATE TRIGGER trg_protect_gap_lock
BEFORE UPDATE OR DELETE ON public.gap_definition_lock
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_gap_lock();

-- Seed the locked definition
INSERT INTO public.gap_definition_lock (id, version)
VALUES ('v1.0', '1.0')
ON CONFLICT DO NOTHING;

-- 2. GAP VALIDATION FUNCTION
CREATE OR REPLACE FUNCTION public.fn_is_valid_gap(p_gap_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_valid boolean;
BEGIN
  SELECT p_gap_type = ANY(valid_gap_types)
  INTO v_valid
  FROM public.gap_definition_lock
  WHERE id = 'v1.0' AND is_locked = true;
  RETURN COALESCE(v_valid, false);
END;
$$;

-- 3. AUDIT RECURSION GUARD
CREATE OR REPLACE FUNCTION public.fn_audit_recursion_guard(p_target_table text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_audit_tables text[] := ARRAY[
  'audit_logs','audit_snapshots','audit_verification_state',
  'audit_control_plane','auto_fix_logs','system_health_logs',
  'observability_root_causes','gap_definition_lock',
  'system_governance_state','truth_authority_registry'
];
BEGIN
  RETURN NOT (p_target_table = ANY(v_audit_tables));
END;
$$;

-- 4. CLEAN ENTITY PROTECTION TRIGGER
CREATE OR REPLACE FUNCTION public.fn_protect_clean_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.verification_status = 'CLEAN'
     AND NEW.verification_status <> 'CLEAN'
     AND NEW.entity_hash = OLD.entity_hash THEN
    RAISE EXCEPTION 'CLEAN entity % cannot be reclassified without schema hash change', OLD.entity_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_clean_entity ON public.audit_verification_state;
CREATE TRIGGER trg_protect_clean_entity
BEFORE UPDATE ON public.audit_verification_state
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_clean_entity();
