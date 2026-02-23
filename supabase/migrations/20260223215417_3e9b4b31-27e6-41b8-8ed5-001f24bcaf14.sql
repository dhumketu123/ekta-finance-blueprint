
-- =============================================
-- FIX 1: Storage RLS - commitment-exports RESTRICTIVE policy blocks all other buckets
-- Change to PERMISSIVE so it only gates commitment-exports access, not all buckets
-- =============================================
DROP POLICY IF EXISTS "Admin/owner access commitment-exports" ON storage.objects;

CREATE POLICY "Admin/owner access commitment-exports"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'commitment-exports' AND is_admin_or_owner())
WITH CHECK (bucket_id = 'commitment-exports' AND is_admin_or_owner());

-- =============================================
-- FIX 2: financial_transactions - ALL policies are RESTRICTIVE (Permissive: No)
-- With only RESTRICTIVE and zero PERMISSIVE, PostgreSQL denies ALL access.
-- Solution: Drop RESTRICTIVE, recreate as PERMISSIVE.
-- =============================================
DROP POLICY IF EXISTS "Admin/owner full access financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Field officers insert financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Field officers view own financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Treasurer full access financial_transactions" ON public.financial_transactions;

-- Admin/Owner: full CRUD
CREATE POLICY "Admin/owner full access financial_transactions"
ON public.financial_transactions
FOR ALL
TO authenticated
USING (is_admin_or_owner())
WITH CHECK (is_admin_or_owner());

-- Treasurer: full CRUD
CREATE POLICY "Treasurer full access financial_transactions"
ON public.financial_transactions
FOR ALL
TO authenticated
USING (is_treasurer())
WITH CHECK (is_treasurer());

-- Field officers: SELECT own
CREATE POLICY "Field officers view own financial_transactions"
ON public.financial_transactions
FOR SELECT
TO authenticated
USING (is_field_officer() AND created_by = auth.uid());

-- Field officers: INSERT own
CREATE POLICY "Field officers insert financial_transactions"
ON public.financial_transactions
FOR INSERT
TO authenticated
WITH CHECK (is_field_officer() AND created_by = auth.uid());
