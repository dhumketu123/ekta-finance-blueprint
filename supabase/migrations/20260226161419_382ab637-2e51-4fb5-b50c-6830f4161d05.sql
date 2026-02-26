
-- ═══════════════════════════════════════════════════════
-- PHASE 3: SUBSCRIPTION & AUTO-LOCK ENGINE
-- ═══════════════════════════════════════════════════════

-- 1. Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'basic',
    status TEXT NOT NULL DEFAULT 'active',
    max_customers INT NOT NULL DEFAULT 200,
    max_loans INT NOT NULL DEFAULT 50,
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_date TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ,
    locked_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id),
    CONSTRAINT valid_status CHECK (status IN ('active', 'locked', 'expired', 'trial'))
);

-- 2. Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies — Tenant isolation (RESTRICTIVE)
CREATE POLICY "Tenant isolation subscriptions"
ON public.subscriptions AS RESTRICTIVE
FOR ALL TO authenticated
USING (
    (get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id())
)
WITH CHECK (
    (get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id())
);

-- Admin/owner read-only
CREATE POLICY "Admin/owner view subscriptions"
ON public.subscriptions AS RESTRICTIVE
FOR SELECT TO authenticated
USING (is_admin_or_owner());

-- Super admin full access
CREATE POLICY "Super admin full access subscriptions"
ON public.subscriptions AS RESTRICTIVE
FOR ALL TO authenticated
USING (get_user_role() = 'super_admin')
WITH CHECK (get_user_role() = 'super_admin');

-- Deny anonymous
CREATE POLICY "Deny anonymous subscriptions"
ON public.subscriptions AS RESTRICTIVE
FOR SELECT TO anon
USING (false);

-- 4. Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_subscriptions_updated_at();

-- 5. Upsert subscription RPC (SECURITY DEFINER, tenant-aware)
CREATE OR REPLACE FUNCTION public.upsert_subscription(
    p_plan TEXT,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_max_customers INT DEFAULT 200,
    p_max_loans INT DEFAULT 50
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_user_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant context not found';
    END IF;

    INSERT INTO public.subscriptions (tenant_id, plan, start_date, end_date, max_customers, max_loans, status)
    VALUES (v_tenant_id, p_plan, p_start_date, p_end_date, p_max_customers, p_max_loans, 'active')
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        max_customers = EXCLUDED.max_customers,
        max_loans = EXCLUDED.max_loans,
        status = 'active',
        locked_at = NULL,
        locked_reason = NULL,
        updated_at = now();
END;
$$;

-- 6. Unlock subscription RPC (super_admin only)
CREATE OR REPLACE FUNCTION public.unlock_subscription(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := get_user_role();
    IF v_role != 'super_admin' AND NOT is_admin_or_owner() THEN
        RAISE EXCEPTION 'Only super_admin or admin can unlock subscriptions';
    END IF;

    UPDATE public.subscriptions
    SET status = 'active', locked_at = NULL, locked_reason = NULL, updated_at = now()
    WHERE tenant_id = p_tenant_id;
END;
$$;

-- 7. Auto-lock expired subscriptions function (for cron)
CREATE OR REPLACE FUNCTION public.lock_expired_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.subscriptions
    SET status = 'locked',
        locked_at = now(),
        locked_reason = 'Subscription expired automatically',
        updated_at = now()
    WHERE status = 'active'
      AND end_date < now();
END;
$$;

-- 8. Get subscription status function (lightweight check)
CREATE OR REPLACE FUNCTION public.get_subscription_status()
RETURNS TABLE(
    plan TEXT,
    status TEXT,
    max_customers INT,
    max_loans INT,
    end_date TIMESTAMPTZ,
    days_remaining INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_user_tenant_id();
    RETURN QUERY
    SELECT
        s.plan,
        s.status,
        s.max_customers,
        s.max_loans,
        s.end_date,
        GREATEST(0, EXTRACT(DAY FROM s.end_date - now())::INT) AS days_remaining
    FROM public.subscriptions s
    WHERE s.tenant_id = v_tenant_id
    LIMIT 1;
END;
$$;
