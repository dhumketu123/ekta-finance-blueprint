
-- Fix SECURITY DEFINER view issue
DROP VIEW IF EXISTS public.loan_financial_summary;
CREATE VIEW public.loan_financial_summary WITH (security_invoker = true) AS
SELECT
  l.id AS loan_id,
  l.client_id,
  l.total_principal,
  l.total_interest,
  l.loan_model,
  l.status,
  l.disbursement_date,
  l.maturity_date,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_principal'), 0) AS total_principal_collected,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_interest'), 0) AS total_interest_collected,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'loan_penalty'), 0) AS total_penalty_collected,
  l.outstanding_principal + l.outstanding_interest + l.penalty_amount AS remaining_balance
FROM public.loans l
LEFT JOIN public.transactions t ON t.loan_id = l.id AND t.deleted_at IS NULL AND t.status = 'paid'
WHERE l.deleted_at IS NULL
GROUP BY l.id;
