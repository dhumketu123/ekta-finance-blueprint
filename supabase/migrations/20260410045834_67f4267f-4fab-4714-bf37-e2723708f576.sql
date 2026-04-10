
-- Add claimed_at column
ALTER TABLE public.ledger_guard_queue
ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Drop old function variants
DROP FUNCTION IF EXISTS public.fn_claim_queue_batch(int);
DROP FUNCTION IF EXISTS public.fn_claim_queue(int);

-- Optimized atomic claim function (pure SQL, no PL/pgSQL overhead)
CREATE OR REPLACE FUNCTION public.fn_claim_queue(p_limit int DEFAULT 1000)
RETURNS TABLE(reference_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ledger_guard_queue q
  SET processing = true,
      claimed_at = now()
  WHERE q.reference_id IN (
    SELECT sq.reference_id
    FROM public.ledger_guard_queue sq
    WHERE sq.processed_at IS NULL
      AND sq.processing = false
    ORDER BY sq.reference_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING q.reference_id;
$$;

-- Update processor to use new function name
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_total_debit numeric;
  v_total_credit numeric;
  v_scanned int := 0;
  v_imbalanced int := 0;
  v_mode text;
BEGIN
  SELECT mode INTO v_mode
  FROM public.ledger_guard_config WHERE id = 1;

  IF v_mode = 'FORENSIC' THEN
    RETURN jsonb_build_object('status','skipped_forensic_mode');
  END IF;

  FOR v_rec IN
    SELECT reference_id FROM public.fn_claim_queue(1000)
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
    SET processed_at = now(), processing = false
    WHERE reference_id = v_rec.reference_id;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'imbalanced', v_imbalanced,
    'mode', v_mode,
    'status', 'ZERO_GAP_FINAL_RUN'
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.ledger_guard_queue
  SET processing = false
  WHERE processing = true;

  RETURN jsonb_build_object(
    'status','fatal_recovered',
    'message', SQLERRM
  );
END;
$$;
