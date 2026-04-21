-- Recreate v_account_balance with security_invoker to respect querying user's RLS
DROP VIEW IF EXISTS public.v_account_balance;

CREATE VIEW public.v_account_balance
WITH (security_invoker = true)
AS
SELECT
    account_id,
    tenant_id,
    SUM(debit - credit) AS balance
FROM public.double_entry_ledger
GROUP BY account_id, tenant_id;

COMMENT ON VIEW public.v_account_balance IS 'Single Source of Truth for all financial balances. Uses security_invoker to enforce caller RLS.';