
ALTER TABLE public.ledger_guard_queue
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_recovery_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS stuck_reason text DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS last_recovery_at timestamptz;
