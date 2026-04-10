
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard_v5()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec   record;
  v_debit numeric;
  v_credit numeric;
  v_status text;
  v_scanned    int := 0;
  v_imbalanced int := 0;
BEGIN
  FOR v_rec IN SELECT reference_id FROM public.fn_claim_queue(1000)
  LOOP
    v_scanned := v_scanned + 1;

    /* ── Per-record atomic unit ── */
    BEGIN

      /* 1️⃣  IDEMPOTENCY GATE — direct key check, skip if exists */
      PERFORM 1 FROM public.ledger_idempotency
        WHERE idempotency_key = v_rec.reference_id;
      IF FOUND THEN
        UPDATE public.ledger_guard_queue
           SET processed_at = now(), processing = false
         WHERE reference_id = v_rec.reference_id;
        CONTINUE;
      END IF;

      /* 2️⃣  ADVISORY LOCK — prevent concurrent processing */
      PERFORM pg_advisory_xact_lock(hashtext(v_rec.reference_id::text));

      /* 3️⃣  ATOMIC AGGREGATION */
      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
        INTO v_debit, v_credit
        FROM public.double_entry_ledger
       WHERE reference_id = v_rec.reference_id;

      v_status := CASE WHEN v_debit = v_credit THEN 'PROCESSED' ELSE 'IMBALANCED' END;

      IF v_debit <> v_credit THEN
        v_imbalanced := v_imbalanced + 1;
      END IF;

      /* 4️⃣  EVENT LOG — source of truth, always written FIRST */
      INSERT INTO public.ledger_event_log(
        batch_reference, event_type, debit, credit, imbalance, status
      ) VALUES (
        v_rec.reference_id, 'LEDGER_CHECK',
        v_debit, v_credit, ABS(v_debit - v_credit), v_status
      );

      /* 5️⃣  INTEGRITY STATE — derived from event, written SECOND */
      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken, processed_at
      ) VALUES (
        v_rec.reference_id, v_debit, v_credit,
        ABS(v_debit - v_credit), v_status,
        CASE WHEN v_debit = v_credit THEN 'NONE' ELSE 'AUTO_ISOLATED' END,
        now()
      )
      ON CONFLICT (batch_reference)
      DO UPDATE SET
        total_debit      = EXCLUDED.total_debit,
        total_credit     = EXCLUDED.total_credit,
        imbalance        = EXCLUDED.imbalance,
        status           = EXCLUDED.status,
        auto_action_taken= EXCLUDED.auto_action_taken,
        processed_at     = now();

      /* 6️⃣  CONDITIONAL ISOLATION */
      IF v_debit <> v_credit THEN
        UPDATE public.double_entry_ledger
           SET isolated = true, integrity_checked_at = now()
         WHERE reference_id = v_rec.reference_id;
      END IF;

      /* 7️⃣  IDEMPOTENCY STAMP — after all writes succeed */
      INSERT INTO public.ledger_idempotency(
        idempotency_key, batch_reference, status
      ) VALUES (
        v_rec.reference_id, v_rec.reference_id, v_status
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      /* 8️⃣  QUEUE FINALIZATION — single path, exactly once */
      UPDATE public.ledger_guard_queue
         SET processed_at = now(), processing = false
       WHERE reference_id = v_rec.reference_id;

    EXCEPTION WHEN OTHERS THEN
      /* Error path — idempotent error log + queue release */
      INSERT INTO public.ledger_event_log(
        batch_reference, event_type, status
      ) VALUES (
        v_rec.reference_id, 'PROCESS_ERROR', SQLERRM
      );

      UPDATE public.ledger_guard_queue
         SET processing = false
       WHERE reference_id = v_rec.reference_id;
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned',    v_scanned,
    'imbalanced', v_imbalanced,
    'status',     'V5_STRICT_AGENT'
  );

EXCEPTION WHEN OTHERS THEN
  UPDATE public.ledger_guard_queue
     SET processing = false
   WHERE processing = true;

  RETURN jsonb_build_object(
    'status', 'recovered',
    'error',  SQLERRM
  );
END;
$$;
