-- ════════════════════════════════════════════════════════════════
-- 1. FIX backfill_missing_loan_schedules
--    Accept interest_rate = 0 (was rejecting); use loan_model properly
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.backfill_missing_loan_schedules()
RETURNS TABLE(generated_count integer, skipped_count integer, flagged_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _loan RECORD;
  _gen  integer := 0;
  _skip integer := 0;
  _flag integer := 0;
BEGIN
  FOR _loan IN
    SELECT l.id, l.client_id, l.total_principal, l.disbursement_date,
           COALESCE(l.loan_model::text, 'flat') AS loan_model,
           lp.interest_rate, lp.tenure_months,
           lp.payment_type::text AS payment_type
    FROM public.loans l
    LEFT JOIN public.loan_products lp ON lp.id = l.loan_product_id
    WHERE NOT EXISTS (SELECT 1 FROM public.loan_schedules ls WHERE ls.loan_id = l.id)
      AND l.deleted_at IS NULL
  LOOP
    -- Strict: only product/rate/tenure/date are required. interest_rate = 0 is VALID.
    IF _loan.interest_rate IS NULL
       OR _loan.tenure_months IS NULL OR _loan.tenure_months <= 0
       OR _loan.payment_type IS NULL
       OR _loan.disbursement_date IS NULL
       OR _loan.client_id IS NULL
       OR _loan.total_principal IS NULL
       OR _loan.total_principal <= 0 THEN
      _flag := _flag + 1;
      INSERT INTO public.audit_logs (entity_type, entity_id, action_type, details)
      VALUES ('loan', _loan.id, 'data_anomaly',
              jsonb_build_object('reason','schedule_backfill_skipped_missing_inputs',
                                 'loan_id', _loan.id,
                                 'has_product', _loan.interest_rate IS NOT NULL,
                                 'has_tenure',  _loan.tenure_months IS NOT NULL));
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.generate_loan_schedule(
        _loan.id, _loan.client_id, _loan.total_principal,
        _loan.interest_rate, _loan.tenure_months,
        _loan.payment_type, _loan.loan_model,
        _loan.disbursement_date
      );
      _gen := _gen + 1;
    EXCEPTION WHEN OTHERS THEN
      _flag := _flag + 1;
      INSERT INTO public.audit_logs (entity_type, entity_id, action_type, details)
      VALUES ('loan', _loan.id, 'data_anomaly',
              jsonb_build_object('reason','schedule_backfill_failed',
                                 'error', SQLERRM,
                                 'loan_id', _loan.id));
    END;
  END LOOP;

  generated_count := _gen;
  skipped_count   := _skip;
  flagged_count   := _flag;
  RETURN NEXT;
END $function$;

GRANT EXECUTE ON FUNCTION public.backfill_missing_loan_schedules() TO service_role, authenticated;

-- ════════════════════════════════════════════════════════════════
-- 2. FIX backfill_ledger_from_transactions
--    - Fix SQL bug: "FROM (SELECT r.type) t" → inline CASE
--    - Accept actual project status 'paid' (was only checking completed/approved/success)
--    - Use proper UUID handling
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.backfill_ledger_from_transactions(
  p_dry_run boolean DEFAULT true,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(scanned integer, posted integer, skipped integer, failed integer, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r         RECORD;
  v_tenant  UUID;
  v_event   TEXT;
  v_scanned INT := 0;
  v_posted  INT := 0;
  v_skipped INT := 0;
  v_failed  INT := 0;
  v_errors  JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT t.id, t.client_id, t.type::text AS type_text, t.amount, t.notes, t.performed_by, t.created_at
    FROM public.transactions t
    WHERE t.deleted_at IS NULL
      AND t.status::text IN ('completed', 'approved', 'success', 'paid')
      AND t.amount IS NOT NULL
      AND t.amount > 0
    ORDER BY t.created_at ASC
    LIMIT p_limit
  LOOP
    v_scanned := v_scanned + 1;

    -- Map enum → contract event_type (inline CASE — no broken subquery)
    v_event := CASE r.type_text
      WHEN 'loan_disbursement'   THEN 'LOAN_DISBURSE'
      WHEN 'loan_repayment'      THEN 'LOAN_REPAYMENT'
      WHEN 'loan_principal'      THEN 'LOAN_REPAYMENT'
      WHEN 'loan_interest'       THEN 'INTEREST_PAYMENT'
      WHEN 'loan_penalty'        THEN 'PENALTY_PAYMENT'
      WHEN 'savings_deposit'     THEN 'DPS_DEPOSIT'
      WHEN 'savings_withdrawal'  THEN 'DPS_WITHDRAW'
      ELSE NULL
    END;

    IF v_event IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT c.tenant_id INTO v_tenant
    FROM public.clients c
    WHERE c.id = r.client_id;

    IF v_tenant IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Idempotency
    IF EXISTS (
      SELECT 1 FROM public.double_entry_ledger l
      WHERE l.reference_id = r.id
        AND l.event_type = v_event
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_posted := v_posted + 1;
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.post_financial_event(
        v_tenant, v_event, r.amount, r.id,
        'backfill'::text,
        COALESCE(r.notes, 'Historical backfill from transactions'),
        r.performed_by
      );
      v_posted := v_posted + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'transaction_id', r.id,
        'event', v_event,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN QUERY SELECT v_scanned, v_posted, v_skipped, v_failed, v_errors;
END $function$;

GRANT EXECUTE ON FUNCTION public.backfill_ledger_from_transactions(boolean, integer) TO service_role, authenticated;

-- ════════════════════════════════════════════════════════════════
-- 3. NEW: system_integrity_report — single-call audit summary
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.system_integrity_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger_rows       INT;
  v_total_loans       INT;
  v_loans_no_schedule INT;
  v_legacy_txns       INT;
  v_dlq_pending       INT;
BEGIN
  SELECT COUNT(*) INTO v_ledger_rows FROM public.double_entry_ledger;
  SELECT COUNT(*) INTO v_total_loans FROM public.loans WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_loans_no_schedule
  FROM public.loans l
  WHERE l.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.loan_schedules s WHERE s.loan_id = l.id);
  SELECT COUNT(*) INTO v_legacy_txns FROM public.transactions WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_dlq_pending FROM public.financial_event_dlq WHERE status != 'resolved';

  RETURN jsonb_build_object(
    'ledger_rows', v_ledger_rows,
    'total_loans', v_total_loans,
    'loans_without_schedule', v_loans_no_schedule,
    'legacy_transactions', v_legacy_txns,
    'dlq_pending', v_dlq_pending,
    'grade', CASE
      WHEN v_ledger_rows > 0 AND v_loans_no_schedule = 0 AND v_dlq_pending = 0 THEN 'HEALTHY'
      WHEN v_ledger_rows > 0 AND v_loans_no_schedule < 5 THEN 'OPERATIONAL'
      ELSE 'DEGRADED'
    END,
    'checked_at', now()
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.system_integrity_report() TO service_role, authenticated;