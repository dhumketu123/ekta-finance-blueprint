
-- Add performance indexes for investor wallet transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_investor_id ON public.transactions (investor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc ON public.transactions (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_investor_created ON public.transactions (investor_id, created_at DESC) WHERE deleted_at IS NULL;
