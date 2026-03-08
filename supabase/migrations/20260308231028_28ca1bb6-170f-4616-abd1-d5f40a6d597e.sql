
-- Fix: Add a PERMISSIVE baseline policy for authenticated users on investors table.
-- Without at least one PERMISSIVE policy, all RESTRICTIVE policies result in zero rows.
CREATE POLICY "Authenticated baseline read investors"
  ON public.investors
  FOR SELECT
  TO authenticated
  USING (true);
