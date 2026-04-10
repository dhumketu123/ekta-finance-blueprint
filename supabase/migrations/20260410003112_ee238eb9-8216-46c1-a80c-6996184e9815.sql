
ALTER TABLE public.truth_authority_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_control_plane ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read truth registry"
ON public.truth_authority_registry FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can read audit control plane"
ON public.audit_control_plane FOR SELECT
TO authenticated USING (true);
