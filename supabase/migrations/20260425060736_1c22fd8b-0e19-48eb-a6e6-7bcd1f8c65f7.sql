-- ============================================================
-- v6.0 — FINAL IMMUTABLE PRODUCTION SEAL
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. EXECUTION AUTHORITY KERNEL
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_execution_authority(
  p_job_name TEXT,
  p_function TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_expected TEXT;
BEGIN
  SELECT authoritative_function INTO v_expected
  FROM public.system_cron_registry
  WHERE job_name = p_job_name;

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'UNREGISTERED_CRON: %', p_job_name;
  END IF;

  IF v_expected <> p_function THEN
    RAISE EXCEPTION 'CRON_FUNCTION_MISMATCH: expected=%, got=%', v_expected, p_function;
  END IF;
END $function$;

GRANT EXECUTE ON FUNCTION public.assert_execution_authority(TEXT,TEXT) TO service_role;

-- ─────────────────────────────────────────────
-- 2. GATEWAY IDEMPOTENCY
-- ─────────────────────────────────────────────
ALTER TABLE public.financial_event_gateway
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gateway_idempotency
  ON public.financial_event_gateway(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────
-- 3. GOVERNANCE EXECUTION GATE
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_governance_execution_gate()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_health INT;
BEGIN
  SELECT health_score INTO v_health
  FROM public.governance_metrics_history
  ORDER BY snapshot_time DESC
  LIMIT 1;

  IF v_health IS NULL THEN RETURN; END IF;

  IF v_health < 40 THEN
    RAISE EXCEPTION 'SYSTEM_HARD_FREEZE: governance health critical=%', v_health;
  END IF;

  IF v_health < 65 THEN
    RAISE EXCEPTION 'SYSTEM_THROTTLE: governance degraded=%', v_health;
  END IF;
END $function$;

GRANT EXECUTE ON FUNCTION public.assert_governance_execution_gate() TO service_role;

-- ─────────────────────────────────────────────
-- 4. DLQ AUTO-QUARANTINE
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_dlq_quarantine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
  v_quarantined INT := 0;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.financial_event_dlq WHERE status = 'PENDING_RETRY';

  IF v_count > 1000 THEN
    WITH q AS (
      UPDATE public.financial_event_dlq
      SET status = 'QUARANTINED'
      WHERE status = 'PENDING_RETRY'
        AND failed_at < now() - INTERVAL '1 hour'
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_quarantined FROM q;
  END IF;

  RETURN jsonb_build_object(
    'pending_before', v_count,
    'quarantined', v_quarantined,
    'triggered', v_count > 1000,
    'checked_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.enforce_dlq_quarantine() TO service_role;

-- ─────────────────────────────────────────────
-- 5. UNIFIED SYSTEM GUARD WRAPPER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_guard_execute(
  p_job TEXT,
  p_function TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_execution_authority(p_job, p_function);
  PERFORM public.assert_governance_execution_gate();
END $function$;

GRANT EXECUTE ON FUNCTION public.system_guard_execute(TEXT,TEXT) TO service_role;