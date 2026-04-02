-- Performance indexes for owner/investor heavy queries
CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_owner_id_created
  ON public.owner_profit_shares (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_payment_status
  ON public.owner_profit_shares (payment_status);

CREATE INDEX IF NOT EXISTS idx_investor_weekly_tx_investor_created
  ON public.investor_weekly_transactions (investor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_investor_weekly_tx_tenant
  ON public.investor_weekly_transactions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_investors_tenant_status
  ON public.investors (tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_profit_distributions_period
  ON public.owner_profit_distributions (period_month DESC);