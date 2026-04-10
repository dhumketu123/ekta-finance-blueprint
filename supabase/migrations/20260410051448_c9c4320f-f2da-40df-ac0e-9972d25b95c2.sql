
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

    -- IDEMPOTENCY GUARD
    IF EXISTS (
      SELECT 1 FROM public.ledger_idempotency
      WHERE idempotency_key = v_rec.reference_id
    ) THEN
      UPDATE public.ledger_guard_queue
      SET processed_at = now(), processing = false
      WHERE reference_id = v_rec.reference_id;
      CONTINUE;
    END IF;

    -- ATOMIC AGGREGATION
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_debit, v_credit
    FROM public.double_entry_ledger
    WHERE reference_id = v_rec.reference_id;

    IF v_debit <> v_credit THEN
      v_imbalanced := v_imbalanced + 1;
    END IF;

    -- SINGLE-TRUTH UPSERT
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

    -- EVENT LOG
    INSERT INTO public.ledger_event_log(
      batch_reference, event_type,
      debit, credit, imbalance, status
    ) VALUES (
      v_rec.reference_id, 'LEDGER_CHECK',
      v_debit, v_credit,
      ABS(v_debit - v_credit),
      CASE WHEN v_debit = v_credit THEN 'PROCESSED' ELSE 'IMBALANCED' END
    );

    -- CONDITIONAL ISOLATION
    UPDATE public.double_entry_ledger
    SET isolated = true, integrity_checked_at = now()
    WHERE reference_id = v_rec.reference_id
    AND EXISTS (
      SELECT 1 FROM public.ledger_integrity_state s
      WHERE s.batch_reference = v_rec.reference_id
      AND s.status = 'IMBALANCED'
    );

    -- IDEMPOTENCY STAMP
    INSERT INTO public.ledger_idempotency(
      idempotency_key, batch_reference, status
    ) VALUES (
      v_rec.reference_id, v_rec.reference_id,
      CASE WHEN v_debit = v_credit THEN 'PROCESSED' ELSE 'IMBALANCED' END
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- QUEUE FINALIZATION
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
