
-- Fix: RLS policy for audit_snapshots (internal/service-role only)
CREATE POLICY "Service role only" ON public.audit_snapshots
  FOR ALL USING (auth.role() = 'service_role');
