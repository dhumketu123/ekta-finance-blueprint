
-- Add recovery columns to ledger_guard_queue
ALTER TABLE public.ledger_guard_queue
  ADD COLUMN IF NOT EXISTS recovery_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

-- Create index for stuck job detection
CREATE INDEX IF NOT EXISTS idx_lgq_stuck_jobs
  ON public.ledger_guard_queue (processing, claimed_at)
  WHERE processing = true;

-- Auto-recovery function for stuck ledger jobs
CREATE OR REPLACE FUNCTION public.fn_recover_stuck_ledger_jobs(
  p_stuck_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recovered integer := 0;
  v_cutoff timestamptz;
  v_rec record;
BEGIN
  v_cutoff := now() - (p_stuck_minutes || ' minutes')::interval;

  -- Find and recover stuck jobs atomically
  FOR v_rec IN
    SELECT reference_id
    FROM public.ledger_guard_queue
    WHERE processing = true
      AND claimed_at < v_cutoff
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Release the stuck job
    UPDATE public.ledger_guard_queue
    SET processing = false,
        recovery_flag = true,
        recovered_at = now()
    WHERE reference_id = v_rec.reference_id;

    -- Log recovery event
    INSERT INTO public.ledger_event_log (
      batch_reference, event_type, status, debit, credit, imbalance
    ) VALUES (
      v_rec.reference_id,
      'AUTO_RECOVERY',
      'STUCK_RELEASED',
      0, 0, 0
    );

    v_recovered := v_recovered + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'completed',
    'recovered_count', v_recovered,
    'cutoff_minutes', p_stuck_minutes,
    'executed_at', now()
  );
END;
$$;
