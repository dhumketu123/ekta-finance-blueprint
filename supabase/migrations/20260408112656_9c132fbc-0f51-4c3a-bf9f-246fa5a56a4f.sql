
-- PATCH 7: Add is_locked column
ALTER TABLE public.ai_insights
ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- Need to drop and recreate the unique index to include is_locked = false
DROP INDEX IF EXISTS idx_ai_insights_unique_auto;

CREATE UNIQUE INDEX idx_ai_insights_unique_auto
ON public.ai_insights (entity_id, insight_type)
WHERE metadata->>'auto_generated' = 'true'
  AND status = 'active'
  AND is_locked = false;

-- Rebuild fn_generate_ai_insights with both patches
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_risk_count int := 0;
  v_dep_count int := 0;
  v_anomaly_count int := 0;
  v_circular_count int := 0;
  v_total int := 0;
  v_excess int;
  v_stale_resolved int := 0;
  rec record;
BEGIN
  -- PATCH 4: Auto-resolve stale insights older than 30 days (skip locked)
  WITH resolved AS (
    UPDATE public.ai_insights
    SET status = 'resolved'
    WHERE status = 'active'
      AND is_locked = false
      AND created_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO v_stale_resolved FROM resolved;

  -- Clear old auto-generated active insights (PATCH 7: skip locked)
  UPDATE public.ai_insights
    SET status = 'resolved'
    WHERE status = 'active'
      AND metadata->>'auto_generated' = 'true'
      AND is_locked = false;

  -- 1) High criticality → risk
  FOR rec IN
    SELECT id, entity_name, category, criticality_score, description
    FROM public.system_dna
    WHERE criticality_score >= 4 AND is_active = true AND is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, status, metadata)
    VALUES (
      rec.id, 'risk',
      'High criticality: ' || rec.entity_name,
      COALESCE(rec.description, rec.entity_name) || ' has criticality score ' || rec.criticality_score || '/5',
      CASE WHEN rec.criticality_score >= 5 THEN 5 ELSE 4 END,
      'active',
      jsonb_build_object('auto_generated', 'true', 'category', rec.category, 'criticality', rec.criticality_score)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET description = EXCLUDED.description, severity_score = EXCLUDED.severity_score, created_at = now();
    v_risk_count := v_risk_count + 1;
  END LOOP;

  -- 2) >5 dependencies → dependency_warning
  FOR rec IN
    SELECT sd.id, sd.entity_name, count(*) AS dep_count
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.source_entity_id = sd.id OR er.target_entity_id = sd.id
    WHERE sd.is_active = true AND sd.is_deleted = false
    GROUP BY sd.id, sd.entity_name
    HAVING count(*) > 5
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, status, metadata)
    VALUES (
      rec.id, 'dependency_warning',
      'High dependency count: ' || rec.entity_name,
      rec.entity_name || ' has ' || rec.dep_count || ' dependencies — potential blast radius',
      CASE WHEN rec.dep_count > 10 THEN 5 ELSE 4 END,
      'active',
      jsonb_build_object('auto_generated', 'true', 'dependency_count', rec.dep_count)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET description = EXCLUDED.description, severity_score = EXCLUDED.severity_score, created_at = now();
    v_dep_count := v_dep_count + 1;
  END LOOP;

  -- 3) Inactive but referenced → dependency_warning
  FOR rec IN
    SELECT DISTINCT sd.id, sd.entity_name
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.target_entity_id = sd.id
    WHERE sd.is_active = false AND sd.is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, status, metadata)
    VALUES (
      rec.id, 'dependency_warning',
      'Inactive entity still referenced: ' || rec.entity_name,
      rec.entity_name || ' is inactive but other entities still depend on it',
      4, 'active',
      jsonb_build_object('auto_generated', 'true', 'reason', 'inactive_referenced')
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET description = EXCLUDED.description, severity_score = EXCLUDED.severity_score, created_at = now();
    v_dep_count := v_dep_count + 1;
  END LOOP;

  -- Circular dependency detection
  FOR rec IN
    WITH RECURSIVE dep_graph AS (
      SELECT source_entity_id, target_entity_id, ARRAY[source_entity_id] AS path
      FROM public.entity_relations
      UNION ALL
      SELECT d.source_entity_id, er.target_entity_id, d.path || er.target_entity_id
      FROM dep_graph d
      JOIN public.entity_relations er ON d.target_entity_id = er.source_entity_id
      WHERE NOT er.target_entity_id = ANY(d.path) AND array_length(d.path, 1) < 10
    )
    SELECT DISTINCT dg.source_entity_id AS id, sd.entity_name
    FROM dep_graph dg
    JOIN public.entity_relations er2
      ON dg.target_entity_id = er2.source_entity_id AND er2.target_entity_id = dg.source_entity_id
    JOIN public.system_dna sd ON sd.id = dg.source_entity_id
    WHERE sd.is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, status, metadata)
    VALUES (
      rec.id, 'dependency_warning',
      'Circular dependency detected: ' || rec.entity_name,
      rec.entity_name || ' is part of a circular dependency chain — critical architectural risk',
      5, 'active',
      jsonb_build_object('auto_generated', 'true', 'reason', 'circular_dependency')
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET description = EXCLUDED.description, severity_score = 5, created_at = now();
    v_circular_count := v_circular_count + 1;
  END LOOP;

  -- PATCH 6: Anomaly = >2 version changes in last 7 days (from history)
  FOR rec IN
    SELECT sd.id, sd.entity_name, sd.version, rv.changes_last_7d
    FROM public.system_dna sd
    JOIN (
      SELECT dna_id AS entity_id, count(*) AS changes_last_7d
      FROM public.system_dna_history
      WHERE changed_at > now() - interval '7 days'
      GROUP BY dna_id
      HAVING count(*) > 2
    ) rv ON rv.entity_id = sd.id
    WHERE sd.is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, status, metadata)
    VALUES (
      rec.id, 'anomaly',
      'High version churn: ' || rec.entity_name,
      rec.entity_name || ' has ' || rec.changes_last_7d || ' version changes in 7 days — possible instability',
      3, 'active',
      jsonb_build_object('auto_generated', 'true', 'version', rec.version, 'changes_7d', rec.changes_last_7d)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET description = EXCLUDED.description, severity_score = EXCLUDED.severity_score, created_at = now();
    v_anomaly_count := v_anomaly_count + 1;
  END LOOP;

  -- Cap at 200 active (skip locked)
  SELECT count(*) INTO v_total FROM public.ai_insights WHERE status = 'active';
  IF v_total > 200 THEN
    v_excess := v_total - 200;
    UPDATE public.ai_insights
      SET status = 'resolved'
      WHERE id IN (
        SELECT id FROM public.ai_insights
        WHERE status = 'active' AND is_locked = false
        ORDER BY created_at ASC
        LIMIT v_excess
      );
  END IF;

  PERFORM public.refresh_ai_system_health();

  RETURN jsonb_build_object(
    'total_insights_created', v_risk_count + v_dep_count + v_anomaly_count + v_circular_count,
    'risk', v_risk_count,
    'dependency_warning', v_dep_count,
    'circular_dependency', v_circular_count,
    'anomaly', v_anomaly_count,
    'stale_resolved', v_stale_resolved,
    'capped_at_200', v_total > 200
  );
END;
$$;
