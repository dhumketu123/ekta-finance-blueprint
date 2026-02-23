
-- Phase 6: Performance & Scalability Indexes
-- Loan schedules indexes
CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_status ON public.loan_schedules (loan_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_client_due ON public.loan_schedules (client_id, due_date);
CREATE INDEX IF NOT EXISTS idx_loan_schedules_due_status ON public.loan_schedules (due_date, status);

-- Loans indexes
CREATE INDEX IF NOT EXISTS idx_loans_client_status ON public.loans (client_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON public.loans (next_due_date, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loans_officer ON public.loans (assigned_officer) WHERE deleted_at IS NULL;

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_client_type ON public.transactions (client_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_loan_type ON public.transactions (loan_id, type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions (created_at DESC) WHERE deleted_at IS NULL;

-- Financial transactions indexes
CREATE INDEX IF NOT EXISTS idx_fin_tx_approval ON public.financial_transactions (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_tx_member ON public.financial_transactions (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_tx_type ON public.financial_transactions (transaction_type, approval_status);

-- Ledger entries indexes
CREATE INDEX IF NOT EXISTS idx_ledger_group ON public.ledger_entries (transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON public.ledger_entries (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON public.ledger_entries (reference_id, reference_type);

-- Credit scores index
CREATE INDEX IF NOT EXISTS idx_credit_scores_client ON public.credit_scores (client_id);
CREATE INDEX IF NOT EXISTS idx_credit_scores_risk ON public.credit_scores (score, risk_level);

-- Notification logs dedup index
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup 
ON public.notification_logs (loan_id, client_id, event_type, event_date, installment_number) 
WHERE installment_number IS NOT NULL;

-- Pending transactions indexes
CREATE INDEX IF NOT EXISTS idx_pending_tx_status ON public.pending_transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_tx_submitter ON public.pending_transactions (submitted_by, status);

-- Savings accounts index
CREATE INDEX IF NOT EXISTS idx_savings_client ON public.savings_accounts (client_id) WHERE deleted_at IS NULL;

-- Client risk index
CREATE INDEX IF NOT EXISTS idx_client_risk_level ON public.client_risk (risk_level, probability_score DESC);
