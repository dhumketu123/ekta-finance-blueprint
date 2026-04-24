-- =====================================================
-- STEP 1 — FINANCIAL EVENT CONTRACT FREEZE (FOUNDATION)
-- Adapted to existing tenant-scoped chart_of_accounts schema
-- =====================================================

-- -----------------------------------------------------
-- 1) SEED CORE CHART OF ACCOUNTS PER TENANT (IDEMPOTENT)
-- -----------------------------------------------------
INSERT INTO public.chart_of_accounts (tenant_id, code, name, name_bn, account_type, is_active)
SELECT t.id, v.code, v.name, v.name_bn, v.account_type, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('1001','Cash','নগদ','asset'),
  ('1101','Loan Receivable','ঋণ প্রাপ্য','asset'),
  ('2001','DPS Liability','ডিপিএস দায়','liability'),
  ('4001','Interest Income','সুদ আয়','income'),
  ('4002','Penalty Income','জরিমানা আয়','income'),
  ('9999','Adjustment Suspense','সমন্বয় স্থগিত','expense')
) AS v(code, name, name_bn, account_type)
ON CONFLICT DO NOTHING;

-- Defensive uniqueness for (tenant_id, code) if not already enforced
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='uniq_coa_tenant_code'
  ) THEN
    CREATE UNIQUE INDEX uniq_coa_tenant_code
      ON public.chart_of_accounts(tenant_id, code);
  END IF;
END $$;

-- -----------------------------------------------------
-- 2) FINANCIAL EVENT CONTRACT (THE BRAIN)
-- Global mapping: event_type -> debit/credit account CODE
-- (resolved per tenant at posting time)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_event_contract (
  event_type TEXT PRIMARY KEY,
  ledger_required BOOLEAN NOT NULL DEFAULT true,
  debit_account_code TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_posting CHECK (debit_account_code <> credit_account_code)
);

-- Freeze event -> account mapping (idempotent upsert)
INSERT INTO public.financial_event_contract
  (event_type, ledger_required, debit_account_code, credit_account_code, description)
VALUES
  ('LOAN_DISBURSE',     true, '1101', '1001', 'Loan Receivable Dr / Cash Cr'),
  ('LOAN_REPAYMENT',    true, '1001', '1101', 'Cash Dr / Loan Receivable Cr'),
  ('INTEREST_PAYMENT',  true, '1001', '4001', 'Cash Dr / Interest Income Cr'),
  ('DPS_DEPOSIT',       true, '1001', '2001', 'Cash Dr / DPS Liability Cr'),
  ('DPS_WITHDRAW',      true, '2001', '1001', 'DPS Liability Dr / Cash Cr'),
  ('PENALTY_PAYMENT',   true, '1001', '4002', 'Cash Dr / Penalty Income Cr'),
  ('MANUAL_ADJUSTMENT', true, '9999', '1001', 'Adjustment Suspense Dr / Cash Cr')
ON CONFLICT (event_type) DO UPDATE
SET ledger_required     = EXCLUDED.ledger_required,
    debit_account_code  = EXCLUDED.debit_account_code,
    credit_account_code = EXCLUDED.credit_account_code,
    description         = EXCLUDED.description,
    updated_at          = now();

-- Touch updated_at on row change
CREATE OR REPLACE FUNCTION public.touch_financial_event_contract()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_fec ON public.financial_event_contract;
CREATE TRIGGER trg_touch_fec
BEFORE UPDATE ON public.financial_event_contract
FOR EACH ROW EXECUTE FUNCTION public.touch_financial_event_contract();

-- -----------------------------------------------------
-- 3) RLS — read-only for authenticated; writes via migrations only
-- -----------------------------------------------------
ALTER TABLE public.financial_event_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fec_read_all_auth" ON public.financial_event_contract;
CREATE POLICY "fec_read_all_auth"
ON public.financial_event_contract
FOR SELECT
TO authenticated
USING (true);

-- -----------------------------------------------------
-- 4) VALIDATION FUNCTION — guarantees no orphan mapping per tenant
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_event_contract()
RETURNS TABLE(tenant_id UUID, missing_code TEXT, event_type TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH needed AS (
    SELECT t.id AS tenant_id, c.code
    FROM public.tenants t
    CROSS JOIN (
      SELECT debit_account_code  AS code FROM public.financial_event_contract
      UNION
      SELECT credit_account_code AS code FROM public.financial_event_contract
    ) c
  )
  SELECT n.tenant_id, n.code, fec.event_type
  FROM needed n
  LEFT JOIN public.chart_of_accounts coa
    ON coa.tenant_id = n.tenant_id AND coa.code = n.code
  LEFT JOIN public.financial_event_contract fec
    ON fec.debit_account_code = n.code OR fec.credit_account_code = n.code
  WHERE coa.id IS NULL;
END $$;

-- Hard-fail validation on apply
DO $$
DECLARE missing INT;
BEGIN
  SELECT COUNT(*) INTO missing FROM public.validate_event_contract();
  IF missing > 0 THEN
    RAISE EXCEPTION 'Financial event contract invalid: % missing tenant/account mapping(s)', missing;
  END IF;
END $$;

-- -----------------------------------------------------
-- 5) RESOLVER HELPER — event_type + tenant -> (debit_id, credit_id)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_event_accounts(
  p_tenant_id UUID,
  p_event_type TEXT
)
RETURNS TABLE(debit_account_id UUID, credit_account_id UUID, ledger_required BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dr_code TEXT;
  v_cr_code TEXT;
  v_required BOOLEAN;
BEGIN
  SELECT debit_account_code, credit_account_code, ledger_required
    INTO v_dr_code, v_cr_code, v_required
  FROM public.financial_event_contract
  WHERE event_type = p_event_type;

  IF v_dr_code IS NULL THEN
    RAISE EXCEPTION 'Unknown financial event_type: %', p_event_type;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_dr_code),
    (SELECT id FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND code = v_cr_code),
    v_required;
END $$;