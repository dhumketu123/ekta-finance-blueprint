
CREATE TABLE IF NOT EXISTS public.ledger_event_log (
  event_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_reference uuid NOT NULL,
  event_type text NOT NULL,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  imbalance numeric DEFAULT 0,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ledger_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ledger events"
ON public.ledger_event_log
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_event_log_batch
ON public.ledger_event_log(batch_reference);

CREATE INDEX IF NOT EXISTS idx_event_log_type
ON public.ledger_event_log(event_type, created_at);
