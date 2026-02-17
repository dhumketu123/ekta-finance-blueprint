
-- Create is_treasurer helper function
CREATE OR REPLACE FUNCTION public.is_treasurer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'treasurer')
$$;

-- Treasurer can view and manage pending_transactions (approvals)
CREATE POLICY "Treasurer full access pending_transactions"
ON public.pending_transactions
FOR ALL
USING (is_treasurer());

-- Treasurer can view transactions (ledger)
CREATE POLICY "Treasurer view transactions"
ON public.transactions
FOR SELECT
USING (is_treasurer() AND deleted_at IS NULL);

-- Treasurer can view investors
CREATE POLICY "Treasurer view investors"
ON public.investors
FOR SELECT
USING (is_treasurer() AND deleted_at IS NULL);

-- Treasurer can view savings_accounts
CREATE POLICY "Treasurer view savings_accounts"
ON public.savings_accounts
FOR SELECT
USING (is_treasurer() AND deleted_at IS NULL);

-- Treasurer can view savings_products
CREATE POLICY "Treasurer view savings_products"
ON public.savings_products
FOR SELECT
USING (is_treasurer() AND deleted_at IS NULL);

-- Treasurer can view audit_logs
CREATE POLICY "Treasurer view audit_logs"
ON public.audit_logs
FOR SELECT
USING (is_treasurer());
