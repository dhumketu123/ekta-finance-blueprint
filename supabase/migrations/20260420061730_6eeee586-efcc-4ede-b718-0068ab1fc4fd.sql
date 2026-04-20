-- ── 1. AUDIT / TRUTH / METRICS TABLES (system-global → admin/owner only)
DROP POLICY IF EXISTS "Authenticated users can view audit state" ON public.audit_verification_state;
CREATE POLICY "Admin/owner view audit state"
  ON public.audit_verification_state FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can read truth registry" ON public.truth_authority_registry;
CREATE POLICY "Admin/owner read truth registry"
  ON public.truth_authority_registry FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can view intentional duplicates" ON public.intentional_duplicates_registry;
CREATE POLICY "Admin/owner view intentional duplicates"
  ON public.intentional_duplicates_registry FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated read metrics" ON public.system_metrics_ts;
CREATE POLICY "Admin read metrics"
  ON public.system_metrics_ts FOR SELECT TO authenticated
  USING (public.is_admin());

-- knowledge_sync_dlq.tenant_id is TEXT
DROP POLICY IF EXISTS "Authenticated users can view DLQ" ON public.knowledge_sync_dlq;
CREATE POLICY "Admin/owner view DLQ in tenant"
  ON public.knowledge_sync_dlq FOR SELECT TO authenticated
  USING (public.is_admin_or_owner() AND tenant_id = public.get_user_tenant_id()::text);

-- ── 2. LEDGER INTERNAL TABLES (system-global → admin/owner only)
DROP POLICY IF EXISTS "Authenticated users can view ledger events" ON public.ledger_event_log;
CREATE POLICY "Admin/owner view ledger events"
  ON public.ledger_event_log FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated read on change audit" ON public.ledger_change_audit;
CREATE POLICY "Admin/owner read change audit"
  ON public.ledger_change_audit FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can view integrity state" ON public.ledger_integrity_state;
CREATE POLICY "Admin/owner view integrity state"
  ON public.ledger_integrity_state FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can view idempotency records" ON public.ledger_idempotency;
CREATE POLICY "Admin/owner view idempotency records"
  ON public.ledger_idempotency FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can read deadletter" ON public.ledger_guard_deadletter;
CREATE POLICY "Admin/owner read deadletter"
  ON public.ledger_guard_deadletter FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can read guard config" ON public.ledger_guard_config;
CREATE POLICY "Admin/owner read guard config"
  ON public.ledger_guard_config FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

DROP POLICY IF EXISTS "Authenticated users can read audit control plane" ON public.audit_control_plane;
CREATE POLICY "Admin/owner read audit control plane"
  ON public.audit_control_plane FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

-- ── 3. LOAN/SAVINGS PRODUCTS (no tenant_id → scope via clients join)
DROP POLICY IF EXISTS "Authenticated can view loan_products" ON public.loan_products;
CREATE POLICY "Tenant users view loan_products in use"
  ON public.loan_products FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.loan_product_id = loan_products.id
        AND c.tenant_id = public.get_user_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Authenticated can view savings_products" ON public.savings_products;
CREATE POLICY "Tenant users view savings_products in use"
  ON public.savings_products FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.savings_product_id = savings_products.id
        AND c.tenant_id = public.get_user_tenant_id()
    )
  );

-- ── 4. NOTIFICATION_LOGS treasurer scoping
DROP POLICY IF EXISTS "Treasurer view notification_logs" ON public.notification_logs;
CREATE POLICY "Treasurer view notification_logs in tenant"
  ON public.notification_logs FOR SELECT TO authenticated
  USING (
    public.is_treasurer()
    AND (
      client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = notification_logs.client_id
          AND c.tenant_id = public.get_user_tenant_id()
      )
    )
  );

-- ── 5. ANONYMOUS ACCESS LOCKDOWN
DROP POLICY IF EXISTS "Authenticated view active accounts" ON public.accounts;
CREATE POLICY "Authenticated view active accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated can view active branches" ON public.branches;
CREATE POLICY "Authenticated view active branches"
  ON public.branches FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated read feature_flags" ON public.feature_flags;
CREATE POLICY "Authenticated read feature_flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);
