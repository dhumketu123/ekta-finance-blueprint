
CREATE TABLE IF NOT EXISTS public.ledger_idempotency (
  idempotency_key uuid PRIMARY KEY,
  batch_reference uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ledger_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view idempotency records"
ON public.ledger_idempotency
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_idempotency_batch
ON public.ledger_idempotency(batch_reference);
