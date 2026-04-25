-- ─────────────────────────────────────────────
-- 1. UNIFIED SYSTEM CAP UNLOCK KERNEL
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_cap_unlock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_locked INT;
BEGIN
  UPDATE public.system_cron_registry
  SET is_locked = false
  WHERE is_locked = true;

  SELECT COUNT(*) INTO v_locked
  FROM public.system_cron_registry
  WHERE is_locked = true;

  RETURN jsonb_build_object(
    'unlocked_crons', true,
    'remaining_locked', v_locked,
    'status', 'CAPS_RELEASED'
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_cap_unlock() TO service_role;

-- ─────────────────────────────────────────────
-- 2. GLOBAL ORCHESTRATION CONTROLLER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_orchestration_controller()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workers INT;
  v_pending INT;
BEGIN
  SELECT COUNT(*) INTO v_workers
  FROM public.financial_event_worker_state;

  SELECT COUNT(*) INTO v_pending
  FROM public.financial_event_gateway
  WHERE status = 'PENDING';

  RETURN jsonb_build_object(
    'workers', v_workers,
    'pending_events', v_pending,
    'mode', CASE
      WHEN v_pending > 1000 THEN 'HIGH_LOAD'
      WHEN v_pending > 100 THEN 'NORMAL_LOAD'
      ELSE 'IDLE'
    END,
    'orchestration_status', 'ACTIVE'
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_orchestration_controller() TO service_role, authenticated;

-- ─────────────────────────────────────────────
-- 3. FULL SYSTEM HEALTH FINALIZER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_health_finalizer()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status jsonb;
BEGIN
  SELECT public.enterprise_system_status() INTO v_status;

  RETURN jsonb_build_object(
    'ledger', v_status->'ledger',
    'worker', v_status->'worker',
    'gateway', v_status->'gateway',
    'dlq', v_status->'dlq',
    'governance', v_status->'governance',
    'orchestration', public.system_orchestration_controller(),
    'system_grade',
      CASE
        WHEN COALESCE((v_status->'ledger'->>'imbalance_count')::int, 0) = 0
         AND COALESCE((v_status->'dlq'->>'permanent_failures')::int, 0) = 0
        THEN 'PRODUCTION_GRADE'
        ELSE 'DEGRADED'
      END,
    'checked_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_health_finalizer() TO service_role, authenticated;

-- ─────────────────────────────────────────────
-- 4. BACKWARD GAP CLEANER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.system_gap_cleaner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orphan INT;
BEGIN
  SELECT COUNT(*) INTO v_orphan
  FROM public.financial_event_gateway g
  WHERE g.status = 'PROCESSED'
    AND NOT EXISTS (
      SELECT 1 FROM public.double_entry_ledger l
      WHERE l.root_reference_id = g.id
         OR l.reference_id = g.id
    );

  RETURN jsonb_build_object(
    'orphan_detected', v_orphan,
    'cleanup_mode', 'READ_ONLY_SAFE',
    'status', 'READY_FOR_NEXT_PHASE'
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_gap_cleaner() TO service_role;