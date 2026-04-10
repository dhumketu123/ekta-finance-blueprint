
-- ============================================================
-- LEDGER GUARD V4 PRO FIX PACK
-- ============================================================

-- 0️⃣ ADD MISSING COLUMNS TO QUEUE TABLE
ALTER TABLE public.ledger_guard_queue
ADD COLUMN IF NOT EXISTS processed_at timestamptz,
ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error text;

-- 1️⃣ DEADLETTER DEDUPE SAFETY
ALTER TABLE public.ledger_guard_deadletter
ADD CONSTRAINT uq_deadletter_ref_error UNIQUE (reference_id, error);

-- 2️⃣ SAFE CONCURRENCY QUEUE PROCESSOR
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
  v_diff numeric;
BEGIN
  SELECT mode INTO v_mode
  FROM public.ledger_guard_config
  WHERE id = 1;

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

    -- Check ledger entries exist
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_total_debit, v_total_credit
    FROM public.double_entry_ledger
    WHERE reference_id = v_rec.reference_id;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
      PERFORM public.fn_increment_retry(v_rec.reference_id, 'LEDGER_NOT_FOUND');
      CONTINUE;
    END IF;

    v_diff := v_total_debit - v_total_credit;

    IF ABS(v_diff) > 0 THEN
      v_imbalanced := v_imbalanced + 1;

      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken
      ) VALUES (
        v_rec.reference_id, v_total_debit, v_total_credit,
        ABS(v_diff), 'IMBALANCED', 'auto_isolated'
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

      UPDATE public.ledger_guard_queue
      SET processed_at = now()
      WHERE reference_id = v_rec.reference_id;

    ELSE
      UPDATE public.double_entry_ledger
      SET integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id;

      UPDATE public.ledger_guard_queue
      SET processed_at = now()
      WHERE reference_id = v_rec.reference_id;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'imbalanced', v_imbalanced,
    'mode', v_mode,
    'status', 'SAFE_PROCESSED'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status','error_recovered',
    'message', SQLERRM
  );
END;
$$;

-- 5️⃣ STRICT MODE ENFORCEMENT
CREATE OR REPLACE FUNCTION public.fn_guard_mode_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_mode text;
BEGIN
  SELECT mode INTO v_mode
  FROM public.ledger_guard_config WHERE id = 1;

  IF v_mode = 'STRICT' AND NEW.isolated = true THEN
    RAISE EXCEPTION 'STRICT MODE: isolation blocked';
  END IF;

  RETURN NEW;
END;
$$;

-- 6️⃣ RETRY SYSTEM
CREATE OR REPLACE FUNCTION public.fn_increment_retry(
  p_reference uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.ledger_guard_queue
  SET retry_count = retry_count + 1,
      last_error = p_error
  WHERE reference_id = p_reference;

  SELECT retry_count INTO v_count
  FROM public.ledger_guard_queue
  WHERE reference_id = p_reference;

  IF v_count > 5 THEN
    INSERT INTO public.ledger_guard_deadletter(reference_id, error)
    VALUES (p_reference, p_error)
    ON CONFLICT (reference_id, error) DO NOTHING;

    DELETE FROM public.ledger_guard_queue
    WHERE reference_id = p_reference;
  END IF;
END;
$$;

-- 7️⃣ PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_queue_processing
ON public.ledger_guard_queue(processed_at, retry_count);

CREATE INDEX IF NOT EXISTS idx_ledger_ref
ON public.double_entry_ledger(reference_id);
