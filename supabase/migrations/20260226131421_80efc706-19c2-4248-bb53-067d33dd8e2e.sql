
-- Enable RLS on tenants table (admin-only access)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Only admins can manage tenants
CREATE POLICY "Admin full access tenants"
  ON public.tenants AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- All authenticated users can read their own tenant
CREATE POLICY "Users can view own tenant"
  ON public.tenants AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id());
