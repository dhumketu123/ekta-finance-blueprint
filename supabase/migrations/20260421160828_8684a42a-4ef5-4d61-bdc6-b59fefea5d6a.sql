
-- ============================================================
-- 1. ACCOUNTS TABLE — scope SELECT to user's branch
-- ============================================================
-- Drop the overly-permissive policy that lets any authenticated user
-- read every active account across all branches / tenants.
DROP POLICY IF EXISTS "Authenticated view active accounts" ON public.accounts;

-- Replace with a branch-scoped policy. Admin/owner and treasurer policies
-- already exist and keep their broader access.
CREATE POLICY "Authenticated view own branch accounts"
ON public.accounts
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND branch_id IN (
    SELECT p.branch_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.branch_id IS NOT NULL
  )
);

-- ============================================================
-- 2. REALTIME.MESSAGES — scope subscriptions to user's tenant
-- ============================================================
-- Existing policies use `USING (true)` / `WITH CHECK (true)` which lets
-- any authenticated user subscribe to any channel and receive sensitive
-- rows (NID, phone, capital, etc.) regardless of tenant.
--
-- New policies require channel topics to be prefixed with the user's own
-- tenant id. Clients MUST name channels like:
--   `tenant:<tenant_id>:<feature>`  e.g. `tenant:abc-123:notifications`
-- Channels that don't start with the caller's tenant prefix are denied.

DROP POLICY IF EXISTS "Authenticated realtime read" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated realtime write" ON realtime.messages;

CREATE POLICY "Tenant-scoped realtime read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() IS NOT NULL)
  AND (
    realtime.topic() LIKE (
      'tenant:' || COALESCE(public.get_user_tenant_id()::text, '___no_tenant___') || ':%'
    )
    OR public.is_admin_or_owner()
  )
);

CREATE POLICY "Tenant-scoped realtime write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() IS NOT NULL)
  AND (
    realtime.topic() LIKE (
      'tenant:' || COALESCE(public.get_user_tenant_id()::text, '___no_tenant___') || ':%'
    )
    OR public.is_admin_or_owner()
  )
);
