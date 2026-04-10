
-- 1. ENFORCE SINGLE ENTRY POINT ON system_events
CREATE OR REPLACE FUNCTION public.fn_guarded_event_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Direct writes disabled. Use fn_log_anomaly_master()';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_event_writes ON public.system_events;
CREATE TRIGGER trg_guard_event_writes
BEFORE INSERT ON public.system_events
FOR EACH ROW EXECUTE FUNCTION public.fn_guarded_event_write();

-- 2. Add suppression_state column
ALTER TABLE public.observability_root_causes
ADD COLUMN IF NOT EXISTS suppression_state text NOT NULL DEFAULT 'NONE';

-- 3. SOURCE SUPPRESSION LAYER
CREATE OR REPLACE FUNCTION public.fn_should_emit_event(p_root_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.observability_root_causes
    WHERE root_key = p_root_key
      AND suppression_state = 'ACTIVE'
  ) INTO v_exists;
  RETURN NOT v_exists;
END;
$$;

-- 4. UPDATED MASTER LOGGER WITH SUPPRESSION CHECK
CREATE OR REPLACE FUNCTION public.fn_log_anomaly_master(
  p_entity text,
  p_category text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_root text;
BEGIN
  v_root := p_category || ':' || p_entity;

  IF NOT public.fn_should_emit_event(v_root) THEN
    RETURN;
  END IF;

  PERFORM public.fn_dedupe_anomaly(v_root, p_category);
END;
$$;

-- 5. GLOBAL GOVERNANCE STATE TABLE
CREATE TABLE IF NOT EXISTS public.system_governance_state (
  id text PRIMARY KEY DEFAULT 'GLOBAL',
  truth_lock_enabled boolean DEFAULT true,
  anomaly_logging_enabled boolean DEFAULT true,
  observability_enabled boolean DEFAULT true
);

ALTER TABLE public.system_governance_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view governance state"
ON public.system_governance_state
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.system_governance_state(id)
VALUES ('GLOBAL')
ON CONFLICT DO NOTHING;
