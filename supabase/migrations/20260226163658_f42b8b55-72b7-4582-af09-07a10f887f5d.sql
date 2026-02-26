
-- ══════════════════════════════════════════════
-- PHASE 4: Upgrade sms_logs + Super Admin RPCs
-- ══════════════════════════════════════════════

-- 1. Add missing columns to existing sms_logs
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id);
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sms_logs_tenant ON public.sms_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON public.sms_logs(sent_at DESC);

-- Enable RLS if not already
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any, then recreate
DO $$ BEGIN
  DROP POLICY IF EXISTS "Tenant isolation sms_logs" ON public.sms_logs;
  DROP POLICY IF EXISTS "Admin/owner full access sms_logs" ON public.sms_logs;
  DROP POLICY IF EXISTS "Users view own sms_logs" ON public.sms_logs;
  DROP POLICY IF EXISTS "Users insert own sms_logs" ON public.sms_logs;
  DROP POLICY IF EXISTS "Deny anonymous sms_logs" ON public.sms_logs;
END $$;

CREATE POLICY "Tenant isolation sms_logs" ON public.sms_logs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()))
  WITH CHECK ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()));

CREATE POLICY "Admin/owner full access sms_logs" ON public.sms_logs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Users view own sms_logs" ON public.sms_logs AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (sent_by = auth.uid());

CREATE POLICY "Users insert own sms_logs" ON public.sms_logs AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (sent_by = auth.uid());

CREATE POLICY "Deny anonymous sms_logs" ON public.sms_logs AS RESTRICTIVE
  FOR SELECT TO anon
  USING (false);

-- Timestamp trigger
DROP TRIGGER IF EXISTS update_sms_logs_updated_at ON public.sms_logs;
CREATE TRIGGER update_sms_logs_updated_at
  BEFORE UPDATE ON public.sms_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Send SMS RPC
CREATE OR REPLACE FUNCTION public.send_sms(
  p_recipient TEXT,
  p_message TEXT,
  p_recipient_name TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'manual'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_log_id UUID;
BEGIN
  v_tenant_id := get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant context';
  END IF;

  INSERT INTO public.sms_logs (tenant_id, recipient_phone, recipient_name, message_text, message_type, status, sent_by, sent_at)
  VALUES (v_tenant_id, p_recipient, p_recipient_name, p_message, p_message_type, 'sent', auth.uid(), now())
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- 3. Super Admin Dashboard RPC
CREATE OR REPLACE FUNCTION public.get_super_admin_dashboard()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF get_user_role() != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;

  SELECT jsonb_build_object(
    'total_tenants', (SELECT COUNT(*) FROM public.tenants),
    'active_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active'),
    'locked_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'locked'),
    'expired_subscriptions', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'expired'),
    'total_sms_sent', (SELECT COUNT(*) FROM public.sms_logs WHERE status = 'sent'),
    'sms_this_month', (SELECT COUNT(*) FROM public.sms_logs WHERE status = 'sent' AND sent_at >= date_trunc('month', now())),
    'total_clients', (SELECT COUNT(*) FROM public.clients WHERE deleted_at IS NULL),
    'total_loans', (SELECT COUNT(*) FROM public.loans WHERE deleted_at IS NULL),
    'tenants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'plan', COALESCE(s.plan, 'none'),
        'status', COALESCE(s.status, 'no_subscription'),
        'end_date', s.end_date,
        'max_customers', COALESCE(s.max_customers, 0),
        'max_loans', COALESCE(s.max_loans, 0),
        'client_count', (SELECT COUNT(*) FROM public.clients c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL),
        'loan_count', (SELECT COUNT(*) FROM public.loans l WHERE l.tenant_id = t.id AND l.deleted_at IS NULL),
        'sms_count', (SELECT COUNT(*) FROM public.sms_logs sl WHERE sl.tenant_id = t.id)
      ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM public.tenants t
      LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4. Suspend Tenant RPC
CREATE OR REPLACE FUNCTION public.suspend_tenant(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF get_user_role() != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;
  UPDATE public.subscriptions SET status = 'locked', updated_at = now() WHERE tenant_id = p_tenant_id;
END;
$$;

-- 5. Unsuspend Tenant RPC
CREATE OR REPLACE FUNCTION public.unsuspend_tenant(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF get_user_role() != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;
  UPDATE public.subscriptions SET status = 'active', updated_at = now() WHERE tenant_id = p_tenant_id;
END;
$$;

-- 6. Reset SMS Quota RPC
CREATE OR REPLACE FUNCTION public.reset_sms_quota(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF get_user_role() != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: super_admin only';
  END IF;
  INSERT INTO public.audit_logs (entity_type, action_type, entity_id, user_id, details)
  VALUES ('sms_quota', 'reset', p_tenant_id, auth.uid(), jsonb_build_object('action', 'sms_quota_reset', 'tenant_id', p_tenant_id));
END;
$$;
