
-- MICRO FIX 1: Prevent duplicate relations
ALTER TABLE public.entity_relations
ADD CONSTRAINT entity_relations_unique
UNIQUE (tenant_id, source_entity_id, target_entity_id, relation_type);

-- MICRO FIX 3: Prevent circular dependencies
CREATE OR REPLACE FUNCTION public.fn_prevent_circular_entity_relation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.entity_relations
    WHERE tenant_id = NEW.tenant_id
      AND source_entity_id = NEW.target_entity_id
      AND target_entity_id = NEW.source_entity_id
      AND relation_type = NEW.relation_type
  ) THEN
    RAISE EXCEPTION 'Circular dependency detected between entities';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_circular_entity_relation ON public.entity_relations;

CREATE TRIGGER trg_prevent_circular_entity_relation
BEFORE INSERT ON public.entity_relations
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_circular_entity_relation();

-- MICRO FIX 6: Performance index for AI graph traversal
CREATE INDEX IF NOT EXISTS idx_entity_relations_relation_type
ON public.entity_relations (tenant_id, relation_type);

-- MICRO FIX 7: Protect history version integrity
ALTER TABLE public.system_dna_history
ADD CONSTRAINT dna_history_version_positive
CHECK (version > 0);
