
-- Add processed_at column to ledger_integrity_state
ALTER TABLE public.ledger_integrity_state
ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- V5 Processor with idempotent check + full audit trail
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

    -- 1️⃣ IDEMPOTENT CHECK
    IF EXISTS (
      SELECT 1 FROM public.ledger_integrity_state
      WHERE batch_reference = v_rec.reference_id
      AND status IN ('PROCESSED','IMBALANCED')
    ) THEN
      UPDATE public.ledger_guard_queue
      SET processed_at = now(), processing = false, claimed_at = NULL
      WHERE reference_id = v_rec.reference_id;
      CONTINUE;
    END IF;

    -- 2️⃣ ATOMIC AGGREGATION
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.double_entry_ledger
    WHERE reference_id = v_rec.reference_id;

    -- 3️⃣ IMBALANCE DETECTION
    IF v_debit <> v_credit THEN
      v_imbalanced := v_imbalanced + 1;

      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken, processed_at
      ) VALUES (
        v_rec.reference_id, v_debit, v_credit,
        ABS(v_debit - v_credit), 'IMBALANCED', 'AUTO_ISOLATED', now()
      )
      ON CONFLICT (batch_reference, status)
      DO UPDATE SET
        imbalance = EXCLUDED.imbalance,
        total_debit = EXCLUDED.total_debit,
        total_credit = EXCLUDED.total_credit,
        processed_at = now();

      UPDATE public.double_entry_ledger
      SET isolated = true, integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id;
    ELSE
      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken, processed_at
      ) VALUES (
        v_rec.reference_id, v_debit, v_credit,
        0, 'PROCESSED', 'NONE', now()
      )
      ON CONFLICT (batch_reference, status)
      DO NOTHING;
    END IF;

    -- 4️⃣ ATOMIC QUEUE FINALIZATION
    UPDATE public.ledger_guard_queue
    SET processed_at = now(), processing = false, claimed_at = NULL
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
