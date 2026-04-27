-- ═══════════════════════════════════════════════════════════════
-- ARCHITECTURAL HARDENING v8.0 — FINAL (corrected idempotency)
-- ═══════════════════════════════════════════════════════════════

-- 1️⃣ ENUM: add legacy_quarantine
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'loan_status' AND e.enumlabel = 'legacy_quarantine'
  ) THEN
    ALTER TYPE public.loan_status ADD VALUE 'legacy_quarantine';
  END IF;
END $$;

-- 2️⃣ CORRECTED idempotency index — must include account_id
--    (each event legitimately has 2 rows: debit leg + credit leg)
CREATE UNIQUE INDEX IF NOT EXISTS idx_double_entry_idempotent
ON public.double_entry_ledger(reference_id, event_type, account_id)
WHERE reference_id IS NOT NULL AND event_type IS NOT NULL;

-- 3️⃣ EVENT TYPE MAPPING TABLE
CREATE TABLE IF NOT EXISTS public.event_type_mapping (
  legacy_type text PRIMARY KEY,
  contract_event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_type_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_type_mapping_read_all" ON public.event_type_mapping;
CREATE POLICY "event_type_mapping_read_all"
ON public.event_type_mapping FOR SELECT USING (true);

INSERT INTO public.event_type_mapping (legacy_type, contract_event) VALUES
  ('loan_disbursement','LOAN_DISBURSE'),
  ('loan_repayment','LOAN_REPAYMENT'),
  ('loan_principal','LOAN_REPAYMENT'),
  ('loan_interest','INTEREST_PAYMENT'),
  ('loan_penalty','PENALTY_PAYMENT'),
  ('savings_deposit','DPS_DEPOSIT'),
  ('savings_withdrawal','DPS_WITHDRAW'),
  ('investor_principal_return','INVESTOR_PRINCIPAL'),
  ('investor_profit','INVESTOR_PROFIT')
ON CONFLICT (legacy_type) DO NOTHING;

-- 4️⃣ INVESTOR ACCOUNTS in COA (per tenant, idempotent via NOT EXISTS)
INSERT INTO public.chart_of_accounts (tenant_id, code, name, name_bn, account_type, is_active)
SELECT t.id, '2101', 'Investor Capital', 'বিনিয়োগকারী মূলধন', 'liability', true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '2101'
);

INSERT INTO public.chart_of_accounts (tenant_id, code, name, name_bn, account_type, is_active)
SELECT t.id, '5101', 'Investor Profit Distribution', 'বিনিয়োগকারী লভ্যাংশ', 'expense', true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '5101'
);

-- 5️⃣ INVESTOR EVENT CONTRACTS
INSERT INTO public.financial_event_contract
  (event_type, debit_account_code, credit_account_code, description, ledger_required, is_active, is_tenant_overridable)
VALUES
  ('INVESTOR_PRINCIPAL', '2101', '1001', 'Investor principal return (capital out)', true, true, true),
  ('INVESTOR_PROFIT',    '5101', '1001', 'Investor profit payout (expense)',        true, true, true)
ON CONFLICT (event_type) DO NOTHING;

-- 6️⃣ LEDGER BALANCE VALIDATOR
CREATE OR REPLACE FUNCTION public.validate_ledger_balance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_debit numeric; v_credit numeric;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO v_debit, v_credit FROM public.double_entry_ledger;
  IF round(v_debit,2) <> round(v_credit,2) THEN
    RAISE EXCEPTION 'Ledger imbalance: debit %, credit %', v_debit, v_credit;
  END IF;
END;
$$;

-- 7️⃣ SYSTEM INTEGRITY REPORT (upgraded)
CREATE OR REPLACE FUNCTION public.system_integrity_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ledger_rows int; v_loans_no_schedule int; v_dlq_pending int;
  v_debit numeric; v_credit numeric; v_balance_ok boolean; v_quarantined int;
BEGIN
  SELECT COUNT(*) INTO v_ledger_rows FROM public.double_entry_ledger;

  SELECT COUNT(*) INTO v_loans_no_schedule
  FROM public.loans l
  WHERE l.deleted_at IS NULL
    AND l.status NOT IN ('legacy_quarantine','closed')
    AND NOT EXISTS (SELECT 1 FROM public.loan_schedules s WHERE s.loan_id = l.id);

  SELECT COUNT(*) INTO v_dlq_pending
  FROM public.financial_event_dlq WHERE status != 'resolved';

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO v_debit, v_credit FROM public.double_entry_ledger;
  v_balance_ok := (round(v_debit,2) = round(v_credit,2));

  SELECT COUNT(*) INTO v_quarantined
  FROM public.loans WHERE status = 'legacy_quarantine';

  RETURN jsonb_build_object(
    'ledger_rows', v_ledger_rows,
    'loans_without_schedule', v_loans_no_schedule,
    'quarantined_loans', v_quarantined,
    'dlq_pending', v_dlq_pending,
    'debit_total', v_debit,
    'credit_total', v_credit,
    'ledger_balanced', v_balance_ok,
    'grade',
      CASE
        WHEN NOT v_balance_ok THEN 'CRITICAL'
        WHEN v_loans_no_schedule > 0 THEN 'DEGRADED'
        WHEN v_dlq_pending > 0 THEN 'WARNING'
        ELSE 'HEALTHY'
      END,
    'checked_at', now()
  );
END;
$$;

-- 8️⃣ DEFERRED CONSTRAINT TRIGGER for ledger balance
CREATE OR REPLACE FUNCTION public.enforce_ledger_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.validate_ledger_balance();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ledger_balance ON public.double_entry_ledger;

CREATE CONSTRAINT TRIGGER trg_enforce_ledger_balance
AFTER INSERT OR UPDATE OR DELETE
ON public.double_entry_ledger
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ledger_balance();