
-- ══════════════════════════════════════════════════════════════
--  Graph Integrity Enforcement Function
--  Phase 5: Zero Unknown Orphan Validation
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_graph_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total         int;
  v_standalone    int;
  v_true_orphans  int;
  v_crit_orphans  text[];
  v_ratio         numeric;
  v_status        text;
  v_action        text;
BEGIN
  -- 1. Total node count
  SELECT count(*) INTO v_total
  FROM system_knowledge_graph;

  -- 2. Count intentionally standalone nodes (tagged in metadata)
  SELECT count(*) INTO v_standalone
  FROM system_knowledge_graph
  WHERE metadata->>'classification' = 'intentionally_standalone'
    AND (relationships IS NULL OR relationships = '[]'::jsonb);

  -- 3. True orphans: no relationships AND not tagged standalone
  SELECT count(*) INTO v_true_orphans
  FROM system_knowledge_graph
  WHERE (relationships IS NULL OR relationships = '[]'::jsonb)
    AND (metadata->>'classification' IS DISTINCT FROM 'intentionally_standalone');

  -- 4. Critical orphans: criticality >= 8 with no edges
  SELECT coalesce(array_agg(node_key ORDER BY node_key), '{}')
  INTO v_crit_orphans
  FROM system_knowledge_graph
  WHERE (relationships IS NULL OR relationships = '[]'::jsonb)
    AND (metadata->>'classification' IS DISTINCT FROM 'intentionally_standalone')
    AND coalesce((metadata->>'criticality')::int, 0) >= 8;

  -- 5. Orphan ratio (exclude standalone from denominator)
  v_ratio := CASE
    WHEN (v_total - v_standalone) > 0
    THEN round((v_true_orphans::numeric / (v_total - v_standalone)::numeric) * 100, 2)
    ELSE 0
  END;

  -- 6. Determine status and recommended action
  IF array_length(v_crit_orphans, 1) > 0 THEN
    v_status := 'failed';
    v_action := format(
      'SEVERE: %s critical node(s) lack relationships. Wire immediately: %s',
      array_length(v_crit_orphans, 1),
      array_to_string(v_crit_orphans, ', ')
    );
  ELSIF v_ratio > 5.0 THEN
    v_status := 'failed';
    v_action := format(
      'WARNING: Orphan ratio %.2f%% exceeds 5%% threshold. Review and wire %s orphan node(s).',
      v_ratio, v_true_orphans
    );
  ELSE
    v_status := 'healthy';
    v_action := 'No action required. Graph integrity within acceptable limits.';
  END IF;

  RETURN jsonb_build_object(
    'status',                v_status,
    'total_nodes',           v_total,
    'standalone_excluded',   v_standalone,
    'true_orphan_count',     v_true_orphans,
    'orphan_ratio_pct',      v_ratio,
    'critical_orphans_found', to_jsonb(v_crit_orphans),
    'recommended_action',    v_action,
    'checked_at',            now()
  );
END;
$$;

-- Grant execute to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.check_graph_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_graph_integrity() TO service_role;

COMMENT ON FUNCTION public.check_graph_integrity() IS
  'Enterprise graph integrity validator. Returns JSONB report with orphan detection, critical node checks, and ratio enforcement. Safe for pg_cron scheduling.';
