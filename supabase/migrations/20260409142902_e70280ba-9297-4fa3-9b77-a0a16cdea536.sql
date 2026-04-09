
-- ═══════════════════════════════════════════════════
--  Task 1: Tag remaining 6 orphans as standalone
-- ═══════════════════════════════════════════════════

UPDATE system_knowledge_graph
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"classification": "intentionally_standalone"}'::jsonb
WHERE node_key IN (
  'edge:server-time',
  'function:get_server_time',
  'function:update_subscriptions_updated_at',
  'function:update_tenant_settings_updated_at',
  'function:update_updated_at_column',
  'table:feature_flags'
)
AND (metadata->>'classification' IS DISTINCT FROM 'intentionally_standalone');

-- ═══════════════════════════════════════════════════
--  Task 2: Critical node deletion gatekeeper trigger
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_critical_graph_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce((OLD.metadata->>'criticality')::int, 0) >= 8 THEN
    RAISE EXCEPTION 'DENIED: Cannot delete critical node [%]. Enterprise policy requires deprecation before deletion.', OLD.node_key;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_critical_graph_deletion ON system_knowledge_graph;

CREATE TRIGGER trg_prevent_critical_graph_deletion
  BEFORE DELETE ON system_knowledge_graph
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_critical_graph_deletion();

COMMENT ON FUNCTION public.prevent_critical_graph_deletion() IS
  'Enterprise gatekeeper: blocks deletion of high-criticality (>=8) knowledge graph nodes.';
