
-- 1) Prevent History Flood: only snapshot meaningful changes
CREATE OR REPLACE FUNCTION public.trg_system_dna_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    OLD.entity_name IS DISTINCT FROM NEW.entity_name OR
    OLD.description IS DISTINCT FROM NEW.description OR
    OLD.criticality_score IS DISTINCT FROM NEW.criticality_score OR
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.is_active IS DISTINCT FROM NEW.is_active
  ) THEN
    INSERT INTO public.system_dna_history (
      dna_id, version, snapshot, changed_at
    ) VALUES (
      NEW.id, NEW.version, to_jsonb(NEW), now()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Recreate unique index with proper conditions
DROP INDEX IF EXISTS idx_ai_insights_unique_auto;
CREATE UNIQUE INDEX idx_ai_insights_unique_auto
ON public.ai_insights (entity_id, insight_type)
WHERE metadata->>'auto_generated' = 'true'
  AND status = 'active'
  AND is_locked = false;

-- 3) Performance indexes
CREATE INDEX IF NOT EXISTS idx_system_dna_history_changed_at
ON public.system_dna_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_relations_source
ON public.entity_relations (source_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_relations_target
ON public.entity_relations (target_entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_insights_status
ON public.ai_insights (status);

-- 4) Rebuild fn_generate_ai_insights with cooldown + active-only circular scan
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_high_crit int := 0;
  v_dep_warning int := 0;
  v_anomaly int := 0;
  v_circular int := 0;
  v_rec record;
  v_one_hour_ago timestamptz := now() - interval '1 hour';
BEGIN
  -- Auto-resolve stale insights (>30 days)
  UPDATE public.ai_insights
  SET status = 'resolved'
  WHERE status = 'active'
    AND metadata->>'auto_generated' = 'true'
    AND is_locked = false
    AND created_at < now() - interval '30 days';

  -- Cap active insights at 200
  WITH excess AS (
    SELECT id FROM public.ai_insights
    WHERE status = 'active'
    ORDER BY created_at ASC
    OFFSET 200
  )
  UPDATE public.ai_insights SET status = 'resolved'
  WHERE id IN (SELECT id FROM excess);

  -- 1) High criticality entities
  FOR v_rec IN
    SELECT id, entity_name, criticality_score
    FROM public.system_dna
    WHERE criticality_score >= 4 AND is_active = true
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'risk',
      'High criticality: ' || v_rec.entity_name,
      'Entity ' || v_rec.entity_name || ' has criticality score ' || v_rec.criticality_score,
      CASE WHEN v_rec.criticality_score >= 5 THEN 5 ELSE 4 END,
      jsonb_build_object('auto_generated','true','criticality',v_rec.criticality_score)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_high_crit := v_high_crit + 1; END IF;
  END LOOP;

  -- 2) Entities with >5 dependencies
  FOR v_rec IN
    SELECT sd.id, sd.entity_name, count(*) AS dep_count
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.source_entity_id = sd.id OR er.target_entity_id = sd.id
    WHERE sd.is_active = true
    GROUP BY sd.id, sd.entity_name
    HAVING count(*) > 5
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'dependency_warning',
      'High dependency count: ' || v_rec.entity_name,
      v_rec.entity_name || ' has ' || v_rec.dep_count || ' dependencies',
      4,
      jsonb_build_object('auto_generated','true','dep_count',v_rec.dep_count)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_dep_warning := v_dep_warning + 1; END IF;
  END LOOP;

  -- 3) Circular dependency detection (active entities only)
  FOR v_rec IN
    WITH RECURSIVE dep_graph AS (
      SELECT er.source_entity_id, er.target_entity_id, ARRAY[er.source_entity_id] AS path
      FROM public.entity_relations er
      JOIN public.system_dna sd ON sd.id = er.source_entity_id AND sd.is_active = true
      UNION ALL
      SELECT d.source_entity_id, er.target_entity_id, d.path || er.target_entity_id
      FROM dep_graph d
      JOIN public.entity_relations er ON d.target_entity_id = er.source_entity_id
      WHERE NOT er.target_entity_id = ANY(d.path)
        AND array_length(d.path, 1) < 10
    )
    SELECT DISTINCT dg.source_entity_id AS id, sd.entity_name
    FROM dep_graph dg
    JOIN public.system_dna sd ON sd.id = dg.source_entity_id
    WHERE dg.target_entity_id = dg.source_entity_id
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'dependency_warning',
      'Circular dependency: ' || v_rec.entity_name,
      v_rec.entity_name || ' is part of a circular dependency chain',
      5,
      jsonb_build_object('auto_generated','true','circular',true)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_circular := v_circular + 1; END IF;
  END LOOP;

  -- 4) High version churn (>2 changes in last 7 days)
  FOR v_rec IN
    SELECT sd.id, sd.entity_name, rv.changes_last_7d
    FROM public.system_dna sd
    JOIN (
      SELECT dna_id, count(*) AS changes_last_7d
      FROM public.system_dna_history
      WHERE changed_at > now() - interval '7 days'
      GROUP BY dna_id
      HAVING count(*) > 2
    ) rv ON rv.dna_id = sd.id
    WHERE sd.is_active = true
  LOOP
    INSERT INTO public.ai_insights (
      entity_id, insight_type, title, description, severity_score, metadata
    ) VALUES (
      v_rec.id, 'anomaly',
      'High version churn: ' || v_rec.entity_name,
      v_rec.entity_name || ' changed ' || v_rec.changes_last_7d || ' times in 7 days',
      3,
      jsonb_build_object('auto_generated','true','changes_7d',v_rec.changes_last_7d)
    )
    ON CONFLICT (entity_id, insight_type)
    WHERE metadata->>'auto_generated' = 'true' AND status = 'active' AND is_locked = false
    DO UPDATE SET
      description = EXCLUDED.description,
      severity_score = EXCLUDED.severity_score,
      created_at = now()
    WHERE ai_insights.created_at < v_one_hour_ago;

    IF FOUND THEN v_anomaly := v_anomaly + 1; END IF;
  END LOOP;

  -- Refresh materialized view
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.ai_system_health_mat;
  END;

  RETURN jsonb_build_object(
    'total_insights_created', v_high_crit + v_dep_warning + v_anomaly + v_circular,
    'high_criticality', v_high_crit,
    'dependency_warnings', v_dep_warning,
    'circular_dependencies', v_circular,
    'anomalies', v_anomaly
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_generate_ai_insights() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_ai_insights() TO service_role;
