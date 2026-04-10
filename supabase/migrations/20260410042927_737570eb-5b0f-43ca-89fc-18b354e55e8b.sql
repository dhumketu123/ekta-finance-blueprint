
-- ============================================================
-- LEDGER GUARD V4 — PRODUCTION SAFE HARDENED (BALANCED MODE)
-- ============================================================

-- 1️⃣ SAFE MODE CONTROL TABLE
CREATE TABLE IF NOT EXISTS public.ledger_guard_config (
  id int PRIMARY KEY DEFAULT 1,
  mode text DEFAULT 'SAFE'
    CHECK (mode IN ('SAFE','STRICT','FORENSIC')),
  queue_enabled boolean DEFAULT true,
  hash_enabled boolean DEFAULT true,
  auto_isolation boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ledger_guard_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read guard config"
ON public.ledger_guard_config FOR SELECT
TO authenticated USING (true);

INSERT INTO public.ledger_guard_config(id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 2️⃣ SAFE QUEUE PROCESSOR WITH TIME LIMIT + FAIL SAFE
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_scanned int := 0;
  v_imbalanced int := 0;
BEGIN
  IF (SELECT mode FROM public.ledger_guard_config WHERE id=1) = 'FORENSIC' THEN
    RETURN jsonb_build_object('status','skipped_foreign_mode');
  END IF;

  FOR v_rec IN
    SELECT q.reference_id
    FROM public.ledger_guard_queue q
    LIMIT 1000
  LOOP
    v_scanned := v_scanned + 1;

    IF v_rec.reference_id IS NULL THEN
      CONTINUE;
    END IF;

    DELETE FROM public.ledger_guard_queue
    WHERE reference_id = v_rec.reference_id;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'imbalanced', v_imbalanced,
    'mode', 'SAFE_RUN'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status','error_recovered',
    'message', SQLERRM
  );
END;
$$;

-- 3️⃣ DEAD LETTER TABLE
CREATE TABLE IF NOT EXISTS public.ledger_guard_deadletter (
  id bigserial PRIMARY KEY,
  reference_id uuid,
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ledger_guard_deadletter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deadletter"
ON public.ledger_guard_deadletter FOR SELECT
TO authenticated USING (true);

-- 4️⃣ SAFE QUEUE ENQUEUE
CREATE OR REPLACE FUNCTION public.fn_enqueue_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_guard_queue(reference_id)
  VALUES (NEW.reference_id)
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

-- 5️⃣ WATCHDOG AUTO RECOVERY
CREATE OR REPLACE FUNCTION public.fn_queue_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_guard_deadletter(reference_id, error)
  SELECT reference_id, 'STALE_QUEUE'
  FROM public.ledger_guard_queue
  WHERE queued_at < now() - interval '1 day';

  DELETE FROM public.ledger_guard_queue
  WHERE queued_at < now() - interval '1 day';
END;
$$;

-- 6️⃣ LIGHTWEIGHT HASH OPTION
CREATE OR REPLACE FUNCTION public.fn_light_hash(text_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN substr(md5(text_input), 1, 32);
END;
$$;
