
-- Add branch_id to profiles for branch-level isolation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Create index for branch isolation queries
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles(branch_id);

-- Add canExport permission check function
CREATE OR REPLACE FUNCTION public.can_export()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner', 'treasurer')
  )
$$;
