
-- ============================================================
-- 🛡️ DATA INTEGRITY PATCH v1 — Phase 0 Foundation
-- Surgical, idempotent, non-breaking
-- ============================================================

-- =====================================================
-- GAP 3 — FORCE RLS on 4 financial-critical tables
-- (RLS already enabled; FORCE ensures table owner is also subject to policies.
--  Supabase service_role still bypasses; SECURITY DEFINER fns continue to work.)
-- =====================================================
ALTER TABLE public.clients                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loans                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.double_entry_ledger    FORCE ROW LEVEL SECURITY;

-- =====================================================
-- GAP 2 — Backfill missing loan_schedules
-- Wraps existing generate_loan_schedule() with idempotency guard.
-- Skips loans that already have any schedule row; logs unbackfillable loans.
-- =====================================================
CREATE OR REPLACE FUNCTION public.backfill_missing_loan_schedules()
RETURNS TABLE(generated_count integer, skipped_count integer, flagged_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _loan         RECORD;
  _gen          integer := 0;
  _skip         integer := 0;
  _flag         integer := 0;
BEGIN
  FOR _loan IN
    SELECT l.id, l.client_id, l.total_principal, l.disbursement_date, l.loan_model::text AS loan_model,
           lp.interest_rate, lp.tenure_months, lp.payment_type::text AS payment_type
    FROM public.loans l
    LEFT JOIN public.loan_products lp ON lp.id = l.loan_product_id
    WHERE NOT EXISTS (SELECT 1 FROM public.loan_schedules ls WHERE ls.loan_id = l.id)
  LOOP
    -- Validate prerequisites
    IF _loan.interest_rate IS NULL OR _loan.tenure_months IS NULL
       OR _loan.payment_type IS NULL OR _loan.disbursement_date IS NULL
       OR _loan.client_id IS NULL OR _loan.total_principal IS NULL
       OR _loan.total_principal <= 0 THEN
      _flag := _flag + 1;
      INSERT INTO public.audit_logs (entity_type, entity_id, action_type, details)
      VALUES ('loan', _loan.id, 'data_anomaly',
              jsonb_build_object('reason','schedule_backfill_skipped_missing_inputs','loan_id',_loan.id));
      CONTINUE;
    END IF;

    BEGIN
      PERFORM public.generate_loan_schedule(
        _loan.id, _loan.client_id, _loan.total_principal,
        _loan.interest_rate, _loan.tenure_months,
        _loan.payment_type, COALESCE(_loan.loan_model,'flat'),
        _loan.disbursement_date
      );
      _gen := _gen + 1;
    EXCEPTION WHEN OTHERS THEN
      _flag := _flag + 1;
      INSERT INTO public.audit_logs (entity_type, entity_id, action_type, details)
      VALUES ('loan', _loan.id, 'data_anomaly',
              jsonb_build_object('reason','schedule_backfill_failed','error',SQLERRM,'loan_id',_loan.id));
    END;
  END LOOP;

  generated_count := _gen;
  skipped_count   := _skip;
  flagged_count   := _flag;
  RETURN NEXT;
END;
$$;

-- Execute the backfill in this migration
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM public.backfill_missing_loan_schedules();
  RAISE NOTICE 'Backfill schedules → generated=%, flagged=%', r.generated_count, r.flagged_count;
END $$;

-- =====================================================
-- GAP 5 — Flag orphan financial_transactions (no DELETE)
-- An "orphan" loan-typed FT has reference_id NULL, or a non-existent loan
-- (neither loans.id nor loans.loan_id matches), or a sentinel test value.
-- =====================================================
INSERT INTO public.audit_logs (entity_type, entity_id, action_type, details)
SELECT
  'financial_transaction',
  ft.id,
  'data_anomaly',
  jsonb_build_object(
    'reason','orphan_loan_transaction_no_loan_link',
    'transaction_type', ft.transaction_type::text,
    'reference_id', ft.reference_id,
    'amount', ft.amount,
    'member_id', ft.member_id,
    'created_at', ft.created_at
  )
FROM public.financial_transactions ft
WHERE ft.transaction_type IN ('loan_repayment','loan_disbursement')
  AND (
        ft.reference_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.loans l
          WHERE l.id::text = ft.reference_id OR l.loan_id = ft.reference_id
        )
      )
  -- Idempotency: skip if already flagged
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs al
    WHERE al.entity_type='financial_transaction'
      AND al.entity_id = ft.id
      AND al.action_type='data_anomaly'
  );

-- One summary anomaly row for dashboards
INSERT INTO public.audit_logs (entity_type, action_type, details)
SELECT 'system','data_anomaly',
       jsonb_build_object(
         'reason','orphan_loan_transactions_summary',
         'orphan_count',
           (SELECT COUNT(*) FROM public.financial_transactions ft
            WHERE ft.transaction_type IN ('loan_repayment','loan_disbursement')
              AND (ft.reference_id IS NULL
                   OR NOT EXISTS (SELECT 1 FROM public.loans l
                                  WHERE l.id::text=ft.reference_id OR l.loan_id=ft.reference_id))),
         'detected_at', now()
       )
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs
  WHERE entity_type='system' AND action_type='data_anomaly'
    AND details->>'reason'='orphan_loan_transactions_summary'
    AND created_at > now() - interval '1 hour'
);

-- =====================================================
-- GAP 1 / GAP 6 — DOCUMENT (DO NOT auto-backfill)
-- double_entry_ledger backfill requires per-tx-type debit/credit
-- account mapping (Cash, Loan Receivable, Interest Income, etc.).
-- A naïve UNION-style backfill would corrupt the chart of accounts.
-- This is logged here as a known architectural gap to be fixed by
-- extending disburse_loan() / apply_loan_payment() with proper postings.
-- =====================================================
INSERT INTO public.audit_logs (entity_type, action_type, details)
VALUES ('system','data_anomaly',
        jsonb_build_object(
          'reason','double_entry_ledger_empty_known_gap',
          'note','Posting RPCs (disburse_loan, apply_loan_payment) do not write to double_entry_ledger. Requires posting-engine extension with COA account mappings per transaction type. Tracked separately.',
          'detected_at', now(),
          'severity','high'
        ))
ON CONFLICT DO NOTHING;
