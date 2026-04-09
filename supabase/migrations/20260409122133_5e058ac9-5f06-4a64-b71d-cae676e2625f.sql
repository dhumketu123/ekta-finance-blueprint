
-- 1. Create optimized RPC for loan portfolio counts (replaces full-table scan)
CREATE OR REPLACE FUNCTION public.get_loan_portfolio_counts()
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.status::text, count(*) as cnt
  FROM public.loans l
  WHERE l.deleted_at IS NULL
  GROUP BY l.status;
$$;

-- 2. Close zero-balance default loans (surgical remediation)
UPDATE public.loans
SET status = 'closed', updated_at = now()
WHERE deleted_at IS NULL
  AND status = 'default'
  AND outstanding_principal = 0
  AND outstanding_interest = 0;
