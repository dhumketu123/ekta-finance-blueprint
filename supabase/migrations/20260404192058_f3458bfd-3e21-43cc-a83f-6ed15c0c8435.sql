
-- Revoke API access to materialized view (access only via RPC)
ALTER MATERIALIZED VIEW mv_trial_balance SET SCHEMA extensions;

-- Drop and recreate in extensions schema with correct reference
DROP FUNCTION IF EXISTS public.refresh_trial_balance_mv();

CREATE OR REPLACE FUNCTION public.refresh_trial_balance_mv()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin_or_owner() THEN
        RAISE EXCEPTION 'Unauthorized: admin or owner role required';
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_trial_balance;
END;
$$;

-- RPC to read trial balance from MV (tenant-isolated)
CREATE OR REPLACE FUNCTION public.get_trial_balance_fast()
RETURNS TABLE(
    coa_id UUID,
    account_type TEXT,
    total_debit NUMERIC,
    total_credit NUMERIC,
    net_balance NUMERIC,
    entry_count BIGINT,
    last_entry_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_user_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant not resolved';
    END IF;
    RETURN QUERY
    SELECT mv.coa_id, mv.account_type, mv.total_debit, mv.total_credit,
           mv.net_balance, mv.entry_count, mv.last_entry_at
    FROM extensions.mv_trial_balance mv
    WHERE mv.tenant_id = v_tenant_id;
END;
$$;
