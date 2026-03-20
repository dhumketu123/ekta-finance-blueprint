
-- Fix: unique index on investor_weekly_transactions needs dedup first
-- Skip that constraint; apply remaining indexes only

CREATE INDEX IF NOT EXISTS idx_loans_tenant_id ON public.loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON public.loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loans_assigned_officer ON public.loans(assigned_officer);
CREATE INDEX IF NOT EXISTS idx_pending_tx_status ON public.pending_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pending_tx_submitted ON public.pending_transactions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_owner_profit_dist_period ON public.owner_profit_distributions(period_month);
CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_owner ON public.owner_profit_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_dist ON public.owner_profit_shares(distribution_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_loan_schedule_installment 
  ON public.loan_schedules(loan_id, installment_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_profit_dist_period 
  ON public.owner_profit_distributions(period_month) 
  WHERE distribution_status != 'cancelled';
