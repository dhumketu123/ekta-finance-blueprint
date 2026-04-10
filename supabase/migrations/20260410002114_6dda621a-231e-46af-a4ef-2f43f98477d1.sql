
-- 1. Snapshot immutability: versioned snapshots table
CREATE TABLE IF NOT EXISTS public.audit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_data JSONB NOT NULL,
  entity_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_snapshots ENABLE ROW LEVEL SECURITY;

-- 2. Add dual-hash + snapshot_id columns to audit_verification_state
ALTER TABLE public.audit_verification_state
  ADD COLUMN IF NOT EXISTS behavioral_signature TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.audit_snapshots(id);

-- 3. Upgraded delta audit function with v4.0 rules
CREATE OR REPLACE FUNCTION public.fn_run_delta_audit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_snapshot JSONB;
  v_new INTEGER := 0;
  v_dirty INTEGER := 0;
  v_clean_skipped INTEGER := 0;
  v_unknown_quarantined INTEGER := 0;
  v_rec RECORD;
  v_structural TEXT;
  v_behavioral TEXT;
  v_existing RECORD;
BEGIN
  -- Step 1: Freeze a snapshot (immutable, versioned)
  SELECT jsonb_agg(row_to_json(e)) INTO v_snapshot
  FROM (
    -- Functions
    SELECT 'function' AS entity_type,
           p.proname AS entity_name,
           'public' AS entity_schema,
           md5(p.prosrc || p.proargtypes::text || COALESCE(p.prorettype::text,'')) AS structural_hash,
           md5(p.prosrc) AS behavioral_hash
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
    UNION ALL
    -- Triggers
    SELECT 'trigger',
           t.tgname,
           c.relname,
           md5(t.tgname || c.relname || t.tgtype::text || t.tgenabled::text),
           md5(t.tgname || COALESCE(p2.prosrc, ''))
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    LEFT JOIN pg_proc p2 ON p2.oid = t.tgfoid
    WHERE NOT t.tgisinternal
    UNION ALL
    -- Tables
    SELECT 'table',
           c.relname,
           'public',
           md5(string_agg(a.attname || a.atttypid::text, ',' ORDER BY a.attnum)),
           md5(string_agg(a.attname, ',' ORDER BY a.attnum))
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    GROUP BY c.relname
  ) e;

  INSERT INTO audit_snapshots (id, snapshot_data, entity_count)
  VALUES (gen_random_uuid(), COALESCE(v_snapshot, '[]'::jsonb), COALESCE(jsonb_array_length(v_snapshot), 0))
  RETURNING id INTO v_snapshot_id;

  -- Step 2: Process from frozen snapshot only (no live queries)
  FOR v_rec IN SELECT * FROM jsonb_to_recordset(v_snapshot) AS x(entity_type text, entity_name text, entity_schema text, structural_hash text, behavioral_hash text)
  LOOP
    v_structural := v_rec.structural_hash;
    v_behavioral := v_rec.behavioral_hash;

    SELECT * INTO v_existing
    FROM audit_verification_state
    WHERE entity_type = v_rec.entity_type
      AND entity_name = v_rec.entity_name
      AND entity_schema = v_rec.entity_schema
    LIMIT 1;

    IF v_existing IS NULL THEN
      -- New entity → UNKNOWN (quarantined, NOT auto-CLEAN)
      INSERT INTO audit_verification_state (entity_type, entity_name, entity_schema, entity_hash, behavioral_signature, verification_status, snapshot_id, last_verified_at)
      VALUES (v_rec.entity_type, v_rec.entity_name, v_rec.entity_schema, v_structural, v_behavioral, 'UNKNOWN', v_snapshot_id, now());
      v_new := v_new + 1;
      v_unknown_quarantined := v_unknown_quarantined + 1;

    ELSIF v_existing.verification_status = 'CLEAN'
      AND v_existing.entity_hash = v_structural
      AND COALESCE(v_existing.behavioral_signature, '') = COALESCE(v_behavioral, '') THEN
      -- Dual-hash match → skip (still CLEAN)
      v_clean_skipped := v_clean_skipped + 1;

    ELSE
      -- Any hash mismatch OR was UNKNOWN/DIRTY → mark DIRTY
      UPDATE audit_verification_state
      SET entity_hash = v_structural,
          behavioral_signature = v_behavioral,
          verification_status = 'DIRTY',
          snapshot_id = v_snapshot_id,
          last_verified_at = now(),
          updated_at = now()
      WHERE id = v_existing.id;
      v_dirty := v_dirty + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'new_quarantined', v_new,
    'dirty', v_dirty,
    'clean_skipped', v_clean_skipped,
    'unknown_quarantined', v_unknown_quarantined,
    'protocol_version', '4.0'
  );
END;
$$;

-- 4. Function to promote UNKNOWN → CLEAN after manual/explicit verification
CREATE OR REPLACE FUNCTION public.fn_verify_unknown_entities(p_snapshot_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE audit_verification_state
  SET verification_status = 'CLEAN',
      last_verified_at = now(),
      updated_at = now()
  WHERE verification_status = 'UNKNOWN'
    AND (p_snapshot_id IS NULL OR snapshot_id = p_snapshot_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
