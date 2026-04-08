
-- ═══════════════════════════════════════════════
-- STEP 2: ADD VERSIONING COLUMNS TO system_dna
-- ═══════════════════════════════════════════════
ALTER TABLE public.system_dna
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS criticality_score integer NOT NULL DEFAULT 1;

-- Partial index for soft delete (skip deleted rows)
CREATE INDEX IF NOT EXISTS idx_system_dna_active
  ON public.system_dna (category, entity_name)
  WHERE is_deleted = false;

-- Criticality index
CREATE INDEX IF NOT EXISTS idx_system_dna_criticality
  ON public.system_dna (tenant_id, criticality_score DESC)
  WHERE is_deleted = false;

-- ═══════════════════════════════════════════════
-- STEP 1: CREATE ENTITY RELATIONS TABLE
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.entity_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_entity_id uuid NOT NULL REFERENCES public.system_dna(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES public.system_dna(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_relations_no_self_ref CHECK (source_entity_id <> target_entity_id)
);

CREATE INDEX idx_entity_relations_source ON public.entity_relations (tenant_id, source_entity_id);
CREATE INDEX idx_entity_relations_target ON public.entity_relations (tenant_id, target_entity_id);

ALTER TABLE public.entity_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_entity_relations"
  ON public.entity_relations FOR SELECT
  TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "service_role_all_entity_relations"
  ON public.entity_relations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "block_anon_entity_relations"
  ON public.entity_relations FOR SELECT
  TO anon
  USING (false);

-- ═══════════════════════════════════════════════
-- STEP 3: CREATE CHANGE HISTORY TABLE
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_dna_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dna_id uuid NOT NULL,
  tenant_id uuid,
  snapshot jsonb NOT NULL,
  version integer NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dna_history_dna_id ON public.system_dna_history (dna_id, version);
CREATE INDEX idx_dna_history_tenant ON public.system_dna_history (tenant_id, changed_at DESC);

ALTER TABLE public.system_dna_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_dna_history"
  ON public.system_dna_history FOR SELECT
  TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "block_direct_insert_dna_history"
  ON public.system_dna_history FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "block_direct_update_dna_history"
  ON public.system_dna_history FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "block_direct_delete_dna_history"
  ON public.system_dna_history FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "service_role_all_dna_history"
  ON public.system_dna_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════
-- TRIGGERS: Auto-version + History snapshot
-- ═══════════════════════════════════════════════

-- History snapshot trigger (fires BEFORE update)
CREATE OR REPLACE FUNCTION public.fn_system_dna_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.system_dna_history (dna_id, tenant_id, snapshot, version)
  VALUES (
    OLD.id,
    OLD.tenant_id,
    to_jsonb(OLD),
    OLD.version
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_dna_history
  BEFORE UPDATE ON public.system_dna
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_system_dna_history();

-- Auto-version increment trigger (fires BEFORE update, after history)
CREATE OR REPLACE FUNCTION public.fn_system_dna_auto_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_dna_auto_version
  BEFORE UPDATE ON public.system_dna
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_system_dna_auto_version();

-- ═══════════════════════════════════════════════
-- STEP 4: SOFT DELETE - prevent hard deletes
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_system_dna_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.system_dna
    SET is_deleted = true, is_active = false
    WHERE id = OLD.id;
  RETURN NULL; -- cancel the DELETE
END;
$$;

CREATE TRIGGER trg_system_dna_soft_delete
  BEFORE DELETE ON public.system_dna
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_system_dna_soft_delete();
