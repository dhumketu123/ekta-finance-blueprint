
-- Fix 1: profiles table - require authentication for all SELECT access
CREATE POLICY "Require authentication for profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Block anonymous access explicitly
CREATE POLICY "Deny anonymous profiles access"
ON public.profiles FOR SELECT
TO anon
USING (false);

-- Fix 2: clients table - require authentication for all SELECT access  
CREATE POLICY "Require authentication for clients"
ON public.clients FOR SELECT
TO authenticated
USING (true);

-- Block anonymous access explicitly
CREATE POLICY "Deny anonymous clients access"
ON public.clients FOR SELECT
TO anon
USING (false);
