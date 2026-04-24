-- =========================================================
-- PHASE 4: OBSERVABILITY — financial_event_logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.financial_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  tenant_id UUID,
  reference_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'engine',
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fel_event_type ON public.financial_event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_fel_tenant ON public.financial_event_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fel_created_at ON public.financial_event_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fel_actor ON public.financial_event_logs(actor_user_id);

ALTER TABLE public.financial_event_logs ENABLE ROW LEVEL SECURITY;

-- Read-only access for privileged roles
DROP POLICY IF EXISTS "fel_read_privileged" ON public.financial_event_logs;
CREATE POLICY "fel_read_privileged"
ON public.financial_event_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'treasurer'::app_role)
);

-- Block direct inserts/updates/deletes (only SECURITY DEFINER fn allowed)
REVOKE INSERT, UPDATE, DELETE ON public.financial_event_logs FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.financial_event_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.financial_event_logs FROM anon;

-- =========================================================
-- LOG WRITER (single source of truth)
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_financial_event(
  p_event_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_tenant_id UUID DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'engine',
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.financial_event_logs (
    event_type, actor_user_id, tenant_id, reference_id,
    payload, source, success, error_message
  ) VALUES (
    p_event_type, auth.uid(), p_tenant_id, p_reference_id,
    COALESCE(p_payload, '{}'::jsonb), p_source, p_success, p_error_message
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_financial_event(TEXT, JSONB, UUID, UUID, TEXT, BOOLEAN, TEXT)
  TO authenticated, service_role;

-- =========================================================
-- PHASE 2: INTEGRITY ALERTS TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS public.system_integrity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sia_created_at ON public.system_integrity_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sia_resolved ON public.system_integrity_alerts(resolved);

ALTER TABLE public.system_integrity_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sia_read_privileged" ON public.system_integrity_alerts;
CREATE POLICY "sia_read_privileged"
ON public.system_integrity_alerts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'treasurer'::app_role)
);

DROP POLICY IF EXISTS "sia_resolve_admin" ON public.system_integrity_alerts;
CREATE POLICY "sia_resolve_admin"
ON public.system_integrity_alerts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE INSERT, DELETE ON public.system_integrity_alerts FROM PUBLIC;
REVOKE INSERT, DELETE ON public.system_integrity_alerts FROM authenticated;
REVOKE INSERT, DELETE ON public.system_integrity_alerts FROM anon;

-- =========================================================
-- DAILY INTEGRITY CHECK (runs from cron)
-- =========================================================
CREATE OR REPLACE FUNCTION public.run_daily_integrity_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_readiness JSONB;
  v_contract_gaps INT;
  v_unbalanced INT;
  v_status TEXT;
  v_alert_id UUID;
BEGIN
  -- 1. Readiness snapshot
  v_readiness := public.system_readiness_check();

  -- 2. Contract coverage
  SELECT COUNT(*) INTO v_contract_gaps
  FROM public.audit_contract_coverage()
  WHERE missing_debit OR missing_credit OR orphan_event;

  -- 3. Ledger balance check
  SELECT COUNT(*) INTO v_unbalanced
  FROM public.double_entry_ledger
  WHERE COALESCE(debit, 0) <> COALESCE(credit, 0)
    AND debit > 0 AND credit > 0;

  v_status := CASE
    WHEN (v_readiness->>'status') = 'PRODUCTION_READY'
         AND v_contract_gaps = 0
         AND v_unbalanced = 0 THEN 'CLEAN'
    ELSE 'BROKEN'
  END;

  -- 4. Auto-alert on mismatch
  IF v_status = 'BROKEN' THEN
    INSERT INTO public.system_integrity_alerts (alert_type, severity, snapshot, message)
    VALUES (
      'daily_integrity_mismatch',
      'high',
      jsonb_build_object(
        'readiness', v_readiness,
        'contract_gaps', v_contract_gaps,
        'unbalanced_entries', v_unbalanced
      ),
      format('Daily integrity check failed: %s contract gaps, %s unbalanced entries',
             v_contract_gaps, v_unbalanced)
    )
    RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'readiness', v_readiness,
    'contract_gaps', v_contract_gaps,
    'unbalanced_entries', v_unbalanced,
    'alert_id', v_alert_id,
    'checked_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.run_daily_integrity_check()
  TO authenticated, service_role;

-- =========================================================
-- ENABLE EXTENSIONS + SCHEDULE
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule prior version if exists
DO $$
BEGIN
  PERFORM cron.unschedule('daily-integrity-check');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule: every day at 02:00 Asia/Dhaka == 20:00 UTC previous day
SELECT cron.schedule(
  'daily-integrity-check',
  '0 20 * * *',
  $$ SELECT public.run_daily_integrity_check(); $$
);