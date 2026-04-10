
-- 1. ROOT CAUSE NORMALIZATION LAYER
CREATE TABLE IF NOT EXISTS public.observability_root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_key text UNIQUE,
  category text NOT NULL,
  description text,
  severity int DEFAULT 1,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  occurrence_count int DEFAULT 1
);

ALTER TABLE public.observability_root_causes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view root causes"
ON public.observability_root_causes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2. ANOMALY DEDUPLICATION ENGINE
CREATE OR REPLACE FUNCTION public.fn_dedupe_anomaly(p_key text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.observability_root_causes (root_key, category)
  VALUES (p_key, p_category)
  ON CONFLICT (root_key)
  DO UPDATE SET
    occurrence_count = observability_root_causes.occurrence_count + 1,
    last_seen = now();
END;
$$;

-- 4. VERSION CHURN NORMALIZER
CREATE OR REPLACE FUNCTION public.fn_normalize_version_churn(p_entity text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'schema_evolution_cluster';
END;
$$;

-- 6. AUDIT EXECUTION MASTER ENTRY POINT
CREATE OR REPLACE FUNCTION public.fn_audit_execute_master()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_safe_audit_guard() THEN
    RETURN jsonb_build_object(
      'status', 'BLOCKED',
      'reason', 'SYSTEM_FROZEN_OR_UNSAFE'
    );
  END IF;

  RETURN public.fn_run_delta_audit();
END;
$$;
