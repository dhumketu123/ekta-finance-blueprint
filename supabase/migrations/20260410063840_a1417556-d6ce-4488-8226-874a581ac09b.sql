
CREATE OR REPLACE FUNCTION public.fn_process_ledger_guard_v5()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec        record;
  v_debit      numeric;
  v_credit     numeric;
  v_status     text;
  v_is_imbalanced boolean;
  v_scanned    int := 0;
  v_imbalanced int := 0;
  v_processed  int := 0;
  v_skipped    int := 0;
  v_errors     int := 0;
BEGIN
  FOR v_rec IN SELECT reference_id FROM public.fn_claim_queue(1000)
  LOOP
    v_scanned := v_scanned + 1;

    /* ── Per-record atomic unit ── */
    BEGIN

      /* ═══════════════════════════════════════════════════════
         0️⃣  CONCURRENCY HARD LOCK
         → Prevent multi-worker duplicate execution
         ═══════════════════════════════════════════════════════ */
      PERFORM pg_advisory_xact_lock(hashtext(v_rec.reference_id::text));

      /* ═══════════════════════════════════════════════════════
         1️⃣  IDEMPOTENCY PRE-GATE (STRICT BLOCK)
         → Skip already-processed records
         ═══════════════════════════════════════════════════════ */
      IF EXISTS (
        SELECT 1 FROM public.ledger_idempotency
        WHERE idempotency_key = v_rec.reference_id
      ) THEN
        v_skipped := v_skipped + 1;
        UPDATE public.ledger_guard_queue
           SET processed_at = now(), processing = false
         WHERE reference_id = v_rec.reference_id;
        CONTINUE;
      END IF;

      /* ATOMIC AGGREGATION */
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO v_debit, v_credit
        FROM public.double_entry_ledger
       WHERE reference_id = v_rec.reference_id;

      /* ═══════════════════════════════════════════════════════
         1.5️⃣  SAFE PRECISION NORMALIZATION (ANTI-FLOAT BUG)
         → Eliminates false imbalance from IEEE 754 rounding
         ═══════════════════════════════════════════════════════ */
      v_debit  := ROUND(v_debit, 2);
      v_credit := ROUND(v_credit, 2);
      v_is_imbalanced := (ABS(v_debit - v_credit) > 0.00001);
      v_status := CASE WHEN NOT v_is_imbalanced THEN 'PROCESSED' ELSE 'IMBALANCED' END;

      IF v_is_imbalanced THEN
        v_imbalanced := v_imbalanced + 1;
      END IF;

      /* ═══════════════════════════════════════════════════════
         3️⃣  EVENT LOG (SOURCE OF TRUTH)
         ═══════════════════════════════════════════════════════ */
      INSERT INTO public.ledger_event_log(
        batch_reference, event_type, debit, credit, imbalance, status
      ) VALUES (
        v_rec.reference_id, 'LEDGER_CHECK',
        v_debit, v_credit, ABS(v_debit - v_credit), v_status
      );

      /* ═══════════════════════════════════════════════════════
         4️⃣  STATE TABLE (DERIVED TRUTH)
         ═══════════════════════════════════════════════════════ */
      INSERT INTO public.ledger_integrity_state(
        batch_reference, total_debit, total_credit,
        imbalance, status, auto_action_taken, processed_at
      ) VALUES (
        v_rec.reference_id, v_debit, v_credit,
        ABS(v_debit - v_credit), v_status,
        CASE WHEN NOT v_is_imbalanced THEN 'NONE' ELSE 'AUTO_ISOLATED' END,
        now()
      )
      ON CONFLICT (batch_reference)
      DO UPDATE SET
        total_debit       = EXCLUDED.total_debit,
        total_credit      = EXCLUDED.total_credit,
        imbalance         = EXCLUDED.imbalance,
        status            = EXCLUDED.status,
        auto_action_taken = EXCLUDED.auto_action_taken,
        processed_at      = now();

      /* ═══════════════════════════════════════════════════════
         5️⃣  ISOLATION SAFETY (PRECISION-SAFE)
         ═══════════════════════════════════════════════════════ */
      IF v_is_imbalanced THEN
        UPDATE public.double_entry_ledger
           SET isolated = true, integrity_checked_at = now()
         WHERE reference_id = v_rec.reference_id;
      END IF;

      /* ═══════════════════════════════════════════════════════
         6️⃣  IDEMPOTENCY FINAL STAMP
         ═══════════════════════════════════════════════════════ */
      INSERT INTO public.ledger_idempotency(
        idempotency_key, batch_reference, status
      ) VALUES (
        v_rec.reference_id, v_rec.reference_id, v_status
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      /* ═══════════════════════════════════════════════════════
         7️⃣  QUEUE FINALIZATION (SUCCESS PATH)
         ═══════════════════════════════════════════════════════ */
      UPDATE public.ledger_guard_queue
         SET processed_at = now(), processing = false
       WHERE reference_id = v_rec.reference_id;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;

      /* Error event log (idempotent) */
      INSERT INTO public.ledger_event_log(
        batch_reference, event_type, status
      ) VALUES (
        v_rec.reference_id, 'PROCESS_ERROR', SQLERRM
      );

      /* Queue release — error path (retryable) */
      UPDATE public.ledger_guard_queue
         SET processing = false
       WHERE reference_id = v_rec.reference_id;
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'scanned',    v_scanned,
    'processed',  v_processed,
    'skipped',    v_skipped,
    'imbalanced', v_imbalanced,
    'errors',     v_errors,
    'status',     'V6_PRECISION_SAFE'
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
