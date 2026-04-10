
-- 1) UNIQUE CONSTRAINT
ALTER TABLE public.ledger_integrity_state
  ADD CONSTRAINT uq_integrity_batch_status UNIQUE (batch_reference, status);

-- 2) COMPOSITE INDEX
CREATE INDEX IF NOT EXISTS idx_ledger_reference_isolated
  ON public.double_entry_ledger (reference_id, isolated);

-- 3) HARDENED FUNCTION
CREATE OR REPLACE FUNCTION public.fn_ledger_integrity_guard()
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
  -- Recursion guard
  IF current_setting('ledger.guard.running', true) = 'on' THEN
    RETURN jsonb_build_object('scanned_groups', 0, 'imbalanced_groups', 0, 'skipped', true);
  END IF;
  PERFORM set_config('ledger.guard.running', 'on', true);

  FOR v_rec IN
    SELECT
      d.reference_id,
      COALESCE(SUM(d.debit), 0) AS total_debit,
      COALESCE(SUM(d.credit), 0) AS total_credit
    FROM public.double_entry_ledger d
    WHERE d.reference_id IN (
      SELECT DISTINCT reference_id
      FROM public.double_entry_ledger
      WHERE integrity_checked_at IS NULL
        AND reference_id IS NOT NULL
    )
    GROUP BY d.reference_id
  LOOP
    v_scanned := v_scanned + 1;

    IF v_rec.total_debit <> v_rec.total_credit THEN
      v_imbalanced := v_imbalanced + 1;

      INSERT INTO public.ledger_integrity_state
        (batch_reference, total_debit, total_credit, imbalance, status, auto_action_taken)
      VALUES (
        v_rec.reference_id,
        v_rec.total_debit,
        v_rec.total_credit,
        ABS(v_rec.total_debit - v_rec.total_credit),
        'IMBALANCED',
        'auto_isolated'
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

      UPDATE public.ledger_integrity_state
      SET status = 'ISOLATED'
      WHERE batch_reference = v_rec.reference_id AND status = 'IMBALANCED';

      PERFORM public.fn_log_anomaly_master(
        'ledger',
        v_rec.reference_id,
        5,
        'ledger:' || v_rec.reference_id
      );
    ELSE
      UPDATE public.double_entry_ledger
      SET integrity_checked_at = now()
      WHERE reference_id = v_rec.reference_id
        AND integrity_checked_at IS NULL;
    END IF;
  END LOOP;

  PERFORM set_config('ledger.guard.running', 'off', true);
  RETURN jsonb_build_object('scanned_groups', v_scanned, 'imbalanced_groups', v_imbalanced);
END;
$$;
