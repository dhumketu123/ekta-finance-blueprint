
-- ═══════════════════════════════════════════════════════════
-- P1: DOUBLE_ENTRY_LEDGER PERFORMANCE INDEXES
-- Target: Trial Balance, P&L, Balance Sheet queries <0.5s
-- ═══════════════════════════════════════════════════════════

-- Primary composite: tenant + chart-of-accounts + date (Trial Balance & P&L)
CREATE INDEX IF NOT EXISTS idx_del_tenant_coa_date
ON double_entry_ledger(tenant_id, coa_id, created_at DESC);

-- Reference lookup: tenant + reference type + reference id
CREATE INDEX IF NOT EXISTS idx_del_tenant_ref
ON double_entry_ledger(tenant_id, reference_type, reference_id);

-- Account type aggregation: tenant + account_type + date
CREATE INDEX IF NOT EXISTS idx_del_tenant_acctype_date
ON double_entry_ledger(tenant_id, account_type, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- P1: FINANCIAL_TRANSACTIONS PERFORMANCE INDEXES
-- Target: 10k+ txns/day, investor/client lookups
-- ═══════════════════════════════════════════════════════════

-- Type + date (reporting & filtering)
CREATE INDEX IF NOT EXISTS idx_ft_type_date
ON financial_transactions(transaction_type, created_at DESC);

-- Reference + type (investor/client entity lookups)
CREATE INDEX IF NOT EXISTS idx_ft_ref_type
ON financial_transactions(reference_id, transaction_type);

-- Approved-only partial index (dashboard metrics)
CREATE INDEX IF NOT EXISTS idx_ft_approved_date
ON financial_transactions(created_at DESC)
WHERE approval_status = 'approved';

-- Pending approvals (approval queue)
CREATE INDEX IF NOT EXISTS idx_ft_pending
ON financial_transactions(created_at DESC)
WHERE approval_status = 'pending';

-- ═══════════════════════════════════════════════════════════
-- P1: AUDIT_LOGS PERFORMANCE INDEX
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_audit_entity_date
ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_user_date
ON audit_logs(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- P1: MATERIALIZED VIEW — PRE-AGGREGATED TRIAL BALANCE
-- Eliminates full-table scan on millions of ledger rows
-- ═══════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trial_balance AS
SELECT
    tenant_id,
    coa_id,
    account_type,
    SUM(debit) AS total_debit,
    SUM(credit) AS total_credit,
    SUM(debit) - SUM(credit) AS net_balance,
    COUNT(*) AS entry_count,
    MAX(created_at) AS last_entry_at
FROM double_entry_ledger
WHERE coa_id IS NOT NULL
GROUP BY tenant_id, coa_id, account_type;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tb_tenant_coa
ON mv_trial_balance(tenant_id, coa_id);

-- ═══════════════════════════════════════════════════════════
-- P1: ADMIN-ONLY RPC TO REFRESH MATERIALIZED VIEW
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_trial_balance_mv()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only admin/owner can refresh
    IF NOT is_admin_or_owner() THEN
        RAISE EXCEPTION 'Unauthorized: admin or owner role required';
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trial_balance;
END;
$$;
