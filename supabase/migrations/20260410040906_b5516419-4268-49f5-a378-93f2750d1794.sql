
-- 1) LEDGER INTEGRITY STATE TABLE
CREATE TABLE IF NOT EXISTS public.ledger_integrity_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference text NOT NULL,
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  imbalance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'BALANCED' CHECK (status IN ('BALANCED','IMBALANCED','ISOLATED')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  auto_action_taken text
);

ALTER TABLE public.ledger_integrity_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view integrity state"
ON public.ledger_integrity_state FOR SELECT TO authenticated USING (true);

-- 2) ADD COLUMNS TO double_entry_ledger
ALTER TABLE public.double_entry_ledger
  ADD COLUMN IF NOT EXISTS isolated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS integrity_checked_at timestamptz;

-- 3) PERFORMANCE INDEX
CREATE INDEX IF NOT EXISTS idx_del_reference_id ON public.double_entry_ledger (reference_id);
CREATE INDEX IF NOT EXISTS idx_del_isolated ON public.double_entry_ledger (isolated) WHERE isolated = true;

-- 4) INTEGRITY GUARD FUNCTION
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
  FOR v_rec IN
    SELECT
      reference_id,
      COALESCE(SUM(debit), 0) AS total_debit,
      COALESCE(SUM(credit), 0) AS total_credit
    FROM public.double_entry_ledger
    WHERE integrity_checked_at IS NULL
      AND reference_id IS NOT NULL
    GROUP BY reference_id
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
      ON CONFLICT DO NOTHING;

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
      WHERE reference_id = v_rec.reference_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned_groups', v_scanned, 'imbalanced_groups', v_imbalanced);
END;
$$;

-- 5) TRIGGER WRAPPER (statement-level, returns trigger)
CREATE OR REPLACE FUNCTION public.fn_ledger_integrity_guard_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_ledger_integrity_guard();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_integrity_check ON public.double_entry_ledger;
CREATE TRIGGER trg_ledger_integrity_check
AFTER INSERT ON public.double_entry_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION public.fn_ledger_integrity_guard_trigger();

-- 6) PREVENT DELETE OF ISOLATED ENTRIES
CREATE OR REPLACE FUNCTION public.fn_block_isolated_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.isolated = true THEN
    RAISE EXCEPTION 'Cannot delete isolated ledger entry %. Resolve integrity issue first.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_isolated_delete ON public.double_entry_ledger;
CREATE TRIGGER trg_block_isolated_delete
BEFORE DELETE ON public.double_entry_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_block_isolated_delete();
