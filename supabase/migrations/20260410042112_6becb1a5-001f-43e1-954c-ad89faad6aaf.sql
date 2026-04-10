
-- ============================================================
-- LEDGER INTEGRITY GUARD V3 – ULTRA HARDENED EDITION
-- ============================================================

-- 1️⃣ HARDEN ledger_integrity_state TABLE
ALTER TABLE public.ledger_integrity_state
ADD COLUMN IF NOT EXISTS integrity_hash text,
ADD COLUMN IF NOT EXISTS previous_hash text,
ADD COLUMN IF NOT EXISTS quarantine_reason text,
ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
ADD COLUMN IF NOT EXISTS anomaly_score numeric DEFAULT 0;

-- resolved_at already exists, skip

-- 2️⃣ HASH CHAIN FUNCTION (Tamper Evident Layer)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.fn_generate_integrity_hash(
  p_reference uuid,
  p_total_debit numeric,
  p_total_credit numeric,
  p_prev_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
BEGIN
  v_raw := p_reference::text || '|' ||
           coalesce(p_total_debit::text,'0') || '|' ||
           coalesce(p_total_credit::text,'0') || '|' ||
           coalesce(p_prev_hash,'0');
  RETURN encode(digest(v_raw, 'sha256'), 'hex');
END;
$$;

-- 3️⃣ QUEUE TABLE (Async Safe Processing)
CREATE TABLE IF NOT EXISTS public.ledger_guard_queue (
  reference_id uuid PRIMARY KEY,
  queued_at timestamptz DEFAULT now()
);

ALTER TABLE public.ledger_guard_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service only access on guard queue"
ON public.ledger_guard_queue
FOR ALL
TO authenticated
USING (false);

CREATE INDEX IF NOT EXISTS idx_queue_time
ON public.ledger_guard_queue (queued_at);

-- 4️⃣ TRIGGER → QUEUE (Lightweight)
CREATE OR REPLACE FUNCTION public.fn_enqueue_ledger_guard()
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

-- Drop old heavy trigger
DROP TRIGGER IF EXISTS trg_ledger_integrity_check ON public.double_entry_ledger;
DROP TRIGGER IF EXISTS trg_enqueue_guard ON public.double_entry_ledger;

CREATE TRIGGER trg_enqueue_guard
AFTER INSERT ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_ledger_guard();

-- 5️⃣ MAIN GUARD ENGINE (Async Processor)
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_diff numeric;
  v_prev_hash text;
  v_hash text;
  v_scanned int := 0;
  v_imbalanced int := 0;
BEGIN
  FOR v_rec IN
    SELECT q.reference_id,
           COALESCE(SUM(l.debit), 0) AS total_debit,
           COALESCE(SUM(l.credit), 0) AS total_credit
    FROM public.ledger_guard_queue q
    JOIN public.double_entry_ledger l
      ON l.reference_id = q.reference_id::text
    GROUP BY q.reference_id
  LOOP
    v_scanned := v_scanned + 1;
    v_diff := v_rec.total_debit - v_rec.total_credit;

    SELECT integrity_hash INTO v_prev_hash
    FROM public.ledger_integrity_state
    WHERE batch_reference = v_rec.reference_id::text
    ORDER BY detected_at DESC
    LIMIT 1;

    v_hash := public.fn_generate_integrity_hash(
      v_rec.reference_id,
      v_rec.total_debit,
      v_rec.total_credit,
      v_prev_hash
    );

    IF v_diff <> 0 THEN
      v_imbalanced := v_imbalanced + 1;

      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit, imbalance,
        status, integrity_hash, previous_hash,
        quarantine_reason, quarantined_at, anomaly_score, auto_action_taken
      )
      VALUES (
        v_rec.reference_id::text,
        v_rec.total_debit, v_rec.total_credit, ABS(v_diff),
        'ISOLATED', v_hash, v_prev_hash,
        'AUTO_IMBALANCE_DETECTED', now(),
        CASE WHEN ABS(v_diff) > 100000 THEN 10
             WHEN ABS(v_diff) > 10000 THEN 7
             ELSE 5 END,
        'auto_isolated'
      )
      ON CONFLICT (batch_reference, status)
      DO UPDATE SET
        imbalance = EXCLUDED.imbalance,
        total_debit = EXCLUDED.total_debit,
        total_credit = EXCLUDED.total_credit,
        integrity_hash = EXCLUDED.integrity_hash,
        anomaly_score = EXCLUDED.anomaly_score,
        detected_at = now();

      UPDATE public.double_entry_ledger
      SET isolated = true, integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id::text;

    ELSE
      UPDATE public.double_entry_ledger
      SET isolated = false, integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id::text;

      UPDATE public.ledger_integrity_state
      SET status = 'RESOLVED', resolved_at = now()
      WHERE batch_reference = v_rec.reference_id::text
        AND status = 'ISOLATED';
    END IF;

    DELETE FROM public.ledger_guard_queue
    WHERE reference_id = v_rec.reference_id;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned_groups', v_scanned,
    'imbalanced_groups', v_imbalanced
  );
END;
$$;

-- 6️⃣ IMMUTABLE CHANGE AUDIT
CREATE TABLE IF NOT EXISTS public.ledger_change_audit (
  id bigserial PRIMARY KEY,
  ledger_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz DEFAULT now(),
  changed_by text
);

ALTER TABLE public.ledger_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read on change audit"
ON public.ledger_change_audit
FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.fn_audit_ledger_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ledger_change_audit(ledger_id, old_data, new_data, changed_by)
  VALUES (OLD.id, to_jsonb(OLD), to_jsonb(NEW), current_user);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ledger_update ON public.double_entry_ledger;
CREATE TRIGGER trg_audit_ledger_update
BEFORE UPDATE ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_ledger_changes();

-- 7️⃣ HARD DELETE BLOCK (replaces old isolated-only block)
CREATE OR REPLACE FUNCTION public.fn_block_all_ledger_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger deletion is permanently blocked. Use reversal entry.';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_isolated_delete ON public.double_entry_ledger;
DROP TRIGGER IF EXISTS trg_block_delete ON public.double_entry_ledger;
CREATE TRIGGER trg_block_delete
BEFORE DELETE ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_block_all_ledger_delete();

-- Update status check to allow RESOLVED
ALTER TABLE public.ledger_integrity_state DROP CONSTRAINT IF EXISTS ledger_integrity_state_status_check;
ALTER TABLE public.ledger_integrity_state ADD CONSTRAINT ledger_integrity_state_status_check
  CHECK (status IN ('BALANCED','IMBALANCED','ISOLATED','RESOLVED'));
