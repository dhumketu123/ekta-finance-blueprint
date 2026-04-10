
-- =============================================
-- TRUTH LOCK PROTOCOL v3.0 — Stateful Audit Memory
-- =============================================

-- 1. Audit Verification State (delta-only scanning memory)
CREATE TABLE IF NOT EXISTS public.audit_verification_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,          -- 'function', 'trigger', 'table', 'index', 'policy'
  entity_name text NOT NULL,
  entity_schema text NOT NULL DEFAULT 'public',
  entity_hash text NOT NULL,          -- SHA256 of entity definition
  verification_status text NOT NULL DEFAULT 'UNKNOWN',  -- CLEAN | DIRTY | UNKNOWN
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  verified_by text DEFAULT 'system',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_verification_status CHECK (verification_status IN ('CLEAN', 'DIRTY', 'UNKNOWN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_entity
  ON public.audit_verification_state (entity_type, entity_schema, entity_name);

ALTER TABLE public.audit_verification_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit state"
  ON public.audit_verification_state FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only system can modify audit state"
  ON public.audit_verification_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Intentional Duplicates Registry (known-good duplicates that scanners must skip)
CREATE TABLE IF NOT EXISTS public.intentional_duplicates_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  duplicate_reason text NOT NULL,     -- why this duplicate is intentional
  signatures text[] NOT NULL DEFAULT '{}',  -- list of overload signatures or trigger targets
  registered_at timestamptz NOT NULL DEFAULT now(),
  registered_by text DEFAULT 'system'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intentional_dup
  ON public.intentional_duplicates_registry (entity_type, entity_name);

ALTER TABLE public.intentional_duplicates_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view intentional duplicates"
  ON public.intentional_duplicates_registry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only system can modify intentional duplicates"
  ON public.intentional_duplicates_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Delta Audit Snapshot function (computes current schema hash for comparison)
CREATE OR REPLACE FUNCTION public.fn_compute_schema_snapshot()
RETURNS TABLE(entity_type text, entity_name text, entity_schema text, entity_hash text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Functions
  SELECT
    'function'::text,
    p.proname::text,
    n.nspname::text,
    md5(pg_get_functiondef(p.oid))::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'

  UNION ALL

  -- Triggers (non-internal)
  SELECT
    'trigger'::text,
    t.tgname::text,
    'public'::text,
    md5(t.tgname || '::' || t.tgrelid::regclass::text || '::' || t.tgtype::text)::text
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE NOT t.tgisinternal AND n.nspname = 'public'

  UNION ALL

  -- Tables
  SELECT
    'table'::text,
    c.relname::text,
    n.nspname::text,
    md5(string_agg(a.attname || ':' || t.typname, ',' ORDER BY a.attnum))::text
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_type t ON a.atttypid = t.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname, n.nspname;
$$;

-- 4. Delta Audit Runner — only processes changed entities
CREATE OR REPLACE FUNCTION public.fn_run_delta_audit()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count int := 0;
  v_changed_count int := 0;
  v_clean_count int := 0;
  v_rec record;
BEGIN
  FOR v_rec IN SELECT * FROM public.fn_compute_schema_snapshot()
  LOOP
    -- Check if entity exists in verification state
    IF EXISTS (
      SELECT 1 FROM public.audit_verification_state avs
      WHERE avs.entity_type = v_rec.entity_type
        AND avs.entity_schema = v_rec.entity_schema
        AND avs.entity_name = v_rec.entity_name
    ) THEN
      -- Entity exists — check if hash changed
      IF EXISTS (
        SELECT 1 FROM public.audit_verification_state avs
        WHERE avs.entity_type = v_rec.entity_type
          AND avs.entity_schema = v_rec.entity_schema
          AND avs.entity_name = v_rec.entity_name
          AND avs.entity_hash = v_rec.entity_hash
          AND avs.verification_status = 'CLEAN'
      ) THEN
        -- CLEAN and unchanged — skip
        v_clean_count := v_clean_count + 1;
      ELSE
        -- Hash changed — mark DIRTY
        UPDATE public.audit_verification_state
        SET entity_hash = v_rec.entity_hash,
            verification_status = 'DIRTY',
            updated_at = now()
        WHERE entity_type = v_rec.entity_type
          AND entity_schema = v_rec.entity_schema
          AND entity_name = v_rec.entity_name;
        v_changed_count := v_changed_count + 1;
      END IF;
    ELSE
      -- New entity — insert as UNKNOWN
      INSERT INTO public.audit_verification_state
        (entity_type, entity_name, entity_schema, entity_hash, verification_status)
      VALUES
        (v_rec.entity_type, v_rec.entity_name, v_rec.entity_schema, v_rec.entity_hash, 'UNKNOWN')
      ON CONFLICT (entity_type, entity_schema, entity_name) DO NOTHING;
      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'new_entities', v_new_count,
    'changed_entities', v_changed_count,
    'clean_skipped', v_clean_count,
    'run_at', now()
  );
END;
$$;
