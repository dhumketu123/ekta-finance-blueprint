
-- Drop constraint (not index)
ALTER TABLE public.ledger_integrity_state
DROP CONSTRAINT IF EXISTS uq_integrity_batch_status;

-- Single-truth unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_integrity_single
ON public.ledger_integrity_state(batch_reference);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_queue_processing
ON public.ledger_guard_queue(processing, processed_at, claimed_at);

-- V5 processor
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard_v5()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_debit numeric;
  v_credit numeric;
  v_scanned int := 0;
  v_imbalanced int := 0;
BEGIN
  FOR v_rec IN SELECT reference_id FROM public.fn_claim_queue(1000)
  LOOP
    v_scanned := v_scanned + 1;

    IF EXISTS (
      SELECT 1 FROM public.ledger_integrity_state
      WHERE batch_reference = v_rec.reference_id
      AND status IN ('PROCESSED','IMBALANCED')
    ) THEN
      UPDATE public.ledger_guard_queue
      SET processed_at = now(), processing = false
      WHERE reference_id = v_rec.reference_id;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.double_entry_ledger
    WHERE reference_id = v_rec.reference_id;

    IF v_debit <> v_credit THEN
      v_imbalanced := v_imbalanced + 1;
    END IF;

    INSERT INTO public.ledger_integrity_state(
      batch_reference, total_debit, total_credit,
      imbalance, status, auto_action_taken, processed_at
    ) VALUES (
      v_rec.reference_id, v_debit, v_credit,
      ABS(v_debit - v_credit),
      CASE WHEN v_debit = v_credit THEN 'PROCESSED' ELSE 'IMBALANCED' END,
      CASE WHEN v_debit = v_credit THEN 'NONE' ELSE 'AUTO_ISOLATED' END,
      now()
    )
    ON CONFLICT (batch_reference)
    DO UPDATE SET
      total_debit = EXCLUDED.total_debit,
      total_credit = EXCLUDED.total_credit,
      imbalance = EXCLUDED.imbalance,
      status = EXCLUDED.status,
      auto_action_taken = EXCLUDED.auto_action_taken,
      processed_at = now();

    UPDATE public.double_entry_ledger
    SET isolated = true, integrity_checked_at = now()
    WHERE reference_id = v_rec.reference_id
    AND EXISTS (
      SELECT 1 FROM public.ledger_integrity_state s
      WHERE s.batch_reference = v_rec.reference_id
      AND s.status = 'IMBALANCED'
    );

    UPDATE public.ledger_guard_queue
    SET processed_at = now(), processing = false
    WHERE reference_id = v_rec.reference_id;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'imbalanced', v_imbalanced,
    'status', 'V5_ZERO_GAP_COMPLETE'
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.ledger_guard_queue
  SET processing = false
  WHERE processing = true;

  RETURN jsonb_build_object(
    'status','recovered',
    'error', SQLERRM
  );
END;
$$;
