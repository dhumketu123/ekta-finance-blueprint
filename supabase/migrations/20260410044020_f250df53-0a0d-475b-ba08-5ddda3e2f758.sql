
-- 1️⃣ QUEUE SCHEMA GUARANTEE
ALTER TABLE public.ledger_guard_queue
ADD COLUMN IF NOT EXISTS processed_at timestamptz,
ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error text;

-- 2️⃣ STRICT MODE TRIGGER ATTACH
DROP TRIGGER IF EXISTS trg_guard_strict_mode ON public.double_entry_ledger;
CREATE TRIGGER trg_guard_strict_mode
BEFORE UPDATE ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_mode_check();

-- 3️⃣ FIXED CONCURRENCY PROCESSOR
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
  v_mode text;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT mode INTO v_mode
  FROM public.ledger_guard_config WHERE id = 1;

  IF v_mode = 'FORENSIC' THEN
    RETURN jsonb_build_object('status','skipped_foreign_mode');
  END IF;

  FOR v_rec IN
    SELECT reference_id
    FROM public.ledger_guard_queue
    WHERE processed_at IS NULL
    ORDER BY reference_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1000
  LOOP
    v_scanned := v_scanned + 1;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_total_debit, v_total_credit
    FROM public.double_entry_ledger
    WHERE reference_id = v_rec.reference_id;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
      PERFORM public.fn_increment_retry(v_rec.reference_id, 'LEDGER_NOT_FOUND');
      CONTINUE;
    END IF;

    IF v_total_debit <> v_total_credit THEN
      v_imbalanced := v_imbalanced + 1;

      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken
      ) VALUES (
        v_rec.reference_id, v_total_debit, v_total_credit,
        ABS(v_total_debit - v_total_credit), 'IMBALANCED', 'auto_isolated'
      )
      ON CONFLICT (batch_reference, status)
      DO UPDATE SET
        imbalance = EXCLUDED.imbalance,
        total_debit = EXCLUDED.total_debit,
        total_credit = EXCLUDED.total_credit,
        detected_at = now();

      UPDATE public.double_entry_ledger
      SET isolated = true, integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id;
    END IF;

    UPDATE public.ledger_guard_queue
    SET processed_at = now()
    WHERE reference_id = v_rec.reference_id;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'imbalanced', v_imbalanced,
    'mode', v_mode,
    'status', 'FINAL_SAFE_RUN'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status','error_recovered',
    'message', SQLERRM
  );
END;
$$;

-- 7️⃣ DEADLETTER DEDUPE FIX
ALTER TABLE public.ledger_guard_deadletter
DROP CONSTRAINT IF EXISTS uq_deadletter_ref_error;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deadletter_reference
ON public.ledger_guard_deadletter(reference_id);

-- 8️⃣ PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_queue_active
ON public.ledger_guard_queue(processed_at);
CREATE INDEX IF NOT EXISTS idx_queue_retry
ON public.ledger_guard_queue(retry_count);
CREATE INDEX IF NOT EXISTS idx_ledger_ref
ON public.double_entry_ledger(reference_id);
