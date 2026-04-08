
-- ═══════════════════════════════════════
-- STEP 1: ai_insights table
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.system_dna(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity_score integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_entity ON public.ai_insights (entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON public.ai_insights (insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON public.ai_insights (severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_status ON public.ai_insights (status, created_at DESC);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_all_ai_insights"
  ON public.ai_insights FOR ALL
  TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "service_role_all_ai_insights"
  ON public.ai_insights FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "block_anon_ai_insights"
  ON public.ai_insights FOR SELECT
  TO anon
  USING (false);

-- ═══════════════════════════════════════
-- STEP 2: Materialized view for system health
-- ═══════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ai_system_health_mat AS
SELECT
  (SELECT count(*) FROM public.system_dna WHERE is_deleted = false) AS total_entities,
  (SELECT count(*) FROM public.system_dna WHERE is_active = true AND is_deleted = false) AS active_entities,
  (SELECT ROUND(AVG(criticality_score)::numeric, 1) FROM public.system_dna WHERE is_deleted = false) AS avg_criticality,
  (SELECT count(*) FROM public.system_dna WHERE criticality_score >= 4 AND is_deleted = false) AS high_risk_entities,
  (SELECT count(*) FROM public.entity_relations er
    JOIN public.system_dna sd ON sd.id = er.target_entity_id
    WHERE sd.is_active = false AND sd.is_deleted = false) AS inactive_dependencies,
  (SELECT max(changed_at) FROM public.system_dna_history) AS last_snapshot_time,
  now() AS refreshed_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_system_health_mat_single ON public.ai_system_health_mat (refreshed_at);

CREATE OR REPLACE FUNCTION public.refresh_ai_system_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.ai_system_health_mat;
END;
$$;

-- ═══════════════════════════════════════
-- STEP 3: Core reasoning RPC
-- ═══════════════════════════════════════
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
  v_total int := 0;
  rec record;
  v_dep_total int;
  v_excess int;
BEGIN
  -- Clear previously auto-generated active insights to avoid duplicates
  UPDATE public.ai_insights
    SET status = 'resolved'
    WHERE status = 'active'
      AND metadata->>'auto_generated' = 'true';

  -- 1) High criticality entities → risk
  FOR rec IN
    SELECT id, entity_name, category, criticality_score, description
    FROM public.system_dna
    WHERE criticality_score >= 4
      AND is_active = true
      AND is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, metadata)
    VALUES (
      rec.id,
      'risk',
      'High criticality: ' || rec.entity_name,
      COALESCE(rec.description, rec.entity_name) || ' has criticality score ' || rec.criticality_score || '/5',
      CASE WHEN rec.criticality_score >= 5 THEN 5 ELSE 4 END,
      jsonb_build_object('auto_generated', 'true', 'category', rec.category, 'criticality', rec.criticality_score)
    );
    v_risk_count := v_risk_count + 1;
  END LOOP;

  -- 2) Entities with >5 dependencies → dependency_warning
  FOR rec IN
    SELECT sd.id, sd.entity_name, count(*) AS dep_count
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.source_entity_id = sd.id OR er.target_entity_id = sd.id
    WHERE sd.is_active = true AND sd.is_deleted = false
    GROUP BY sd.id, sd.entity_name
    HAVING count(*) > 5
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, metadata)
    VALUES (
      rec.id,
      'dependency_warning',
      'High dependency count: ' || rec.entity_name,
      rec.entity_name || ' has ' || rec.dep_count || ' dependencies — potential blast radius',
      CASE WHEN rec.dep_count > 10 THEN 5 ELSE 4 END,
      jsonb_build_object('auto_generated', 'true', 'dependency_count', rec.dep_count)
    );
    v_dep_count := v_dep_count + 1;
  END LOOP;

  -- 3) Inactive but still referenced → dependency_warning
  FOR rec IN
    SELECT DISTINCT sd.id, sd.entity_name
    FROM public.system_dna sd
    JOIN public.entity_relations er ON er.target_entity_id = sd.id
    WHERE sd.is_active = false AND sd.is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, metadata)
    VALUES (
      rec.id,
      'dependency_warning',
      'Inactive entity still referenced: ' || rec.entity_name,
      rec.entity_name || ' is inactive but other entities still depend on it',
      4,
      jsonb_build_object('auto_generated', 'true', 'reason', 'inactive_referenced')
    );
    v_dep_count := v_dep_count + 1;
  END LOOP;

  -- 4) High version churn → anomaly
  FOR rec IN
    SELECT id, entity_name, version, updated_at
    FROM public.system_dna
    WHERE version > 5
      AND updated_at > now() - interval '7 days'
      AND is_deleted = false
  LOOP
    INSERT INTO public.ai_insights (entity_id, insight_type, title, description, severity_score, metadata)
    VALUES (
      rec.id,
      'anomaly',
      'High version churn: ' || rec.entity_name,
      rec.entity_name || ' has ' || rec.version || ' versions with recent updates — possible instability',
      3,
      jsonb_build_object('auto_generated', 'true', 'version', rec.version, 'last_updated', rec.updated_at)
    );
    v_anomaly_count := v_anomaly_count + 1;
  END LOOP;

  -- 5) Cap at 200 active insights
  SELECT count(*) INTO v_total FROM public.ai_insights WHERE status = 'active';
  IF v_total > 200 THEN
    v_excess := v_total - 200;
    UPDATE public.ai_insights
      SET status = 'resolved'
      WHERE id IN (
        SELECT id FROM public.ai_insights
        WHERE status = 'active'
        ORDER BY created_at ASC
        LIMIT v_excess
      );
  END IF;

  -- Refresh materialized view
  PERFORM public.refresh_ai_system_health();

  RETURN jsonb_build_object(
    'total_insights_created', v_risk_count + v_dep_count + v_anomaly_count,
    'risk', v_risk_count,
    'dependency_warning', v_dep_count,
    'anomaly', v_anomaly_count,
    'capped_at_200', v_total > 200
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_generate_ai_insights() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_ai_insights() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_ai_system_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_ai_system_health() TO service_role;
