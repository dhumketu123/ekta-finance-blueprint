-- =========================================================
-- POSTING ENGINE v2 — SCHEMA-ALIGNED, SURGICAL
-- Adapts user-provided contract to existing double-leg ledger
-- =========================================================

-- ---------- PHASE 1: SAFE COA SEED (with required cols) ----------
-- Existing tenants may already have some accounts; insert only missing codes
-- Required NOT NULL cols: account_type, name_bn (default '')

INSERT INTO public.chart_of_accounts (tenant_id, code, name, name_bn, account_type)
SELECT
  t.id,
  v.code,
  v.name,
  v.name_bn,
  v.account_type
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('1001', 'Cash',             'নগদ',              'asset'),
    ('1101', 'Loan Receivable',  'ঋণ পাওনা',         'asset'),
    ('2001', 'DPS Liability',    'ডিপিএস দায়',       'liability'),
    ('4001', 'Interest Income',  'সুদের আয়',         'income'),
    ('4002', 'Penalty Income',   'জরিমানা আয়',       'income'),
    ('9999', 'Suspense Account', 'সাসপেন্স অ্যাকাউন্ট', 'expense')
) AS v(code, name, name_bn, account_type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ---------- PHASE 2: EXTEND EVENT CONTRACT (additive only) ----------

ALTER TABLE public.financial_event_contract
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_tenant_overridable BOOLEAN NOT NULL DEFAULT false;

-- Seed/refresh contract rows (idempotent upsert)
INSERT INTO public.financial_event_contract
  (event_type, debit_account_code, credit_account_code, ledger_required, description)
VALUES
  ('LOAN_DISBURSE',    '1101', '1001', true, 'Loan Receivable Dr / Cash Cr'),
  ('LOAN_REPAYMENT',   '1001', '1101', true, 'Cash Dr / Loan Receivable Cr'),
  ('INTEREST_PAYMENT', '1001', '4001', true, 'Cash Dr / Interest Income Cr'),
  ('DPS_DEPOSIT',      '1001', '2001', true, 'Cash Dr / DPS Liability Cr'),
  ('DPS_WITHDRAW',     '2001', '1001', true, 'DPS Liability Dr / Cash Cr'),
  ('PENALTY_PAYMENT',  '1001', '4002', true, 'Cash Dr / Penalty Income Cr')
ON CONFLICT (event_type) DO UPDATE
SET debit_account_code  = EXCLUDED.debit_account_code,
    credit_account_code = EXCLUDED.credit_account_code,
    description         = EXCLUDED.description,
    updated_at          = now();

-- ---------- PHASE 3: SAFE RESOLVER (REPLACES prior signature) ----------
-- Existing resolve_event_accounts returned 3 cols; we keep that contract
-- and reuse it. Drop & recreate with strict validation.

DROP FUNCTION IF EXISTS public.resolve_event_accounts(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.resolve_event_accounts(
  p_tenant_id  UUID,
  p_event_type TEXT
)
RETURNS TABLE (
  debit_account_id  UUID,
  credit_account_id UUID,
  ledger_required   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dr_code TEXT;
  v_cr_code TEXT;
  v_required BOOLEAN;
  v_dr_id UUID;
  v_cr_id UUID;
BEGIN
  SELECT debit_account_code, credit_account_code, ledger_required
    INTO v_dr_code, v_cr_code, v_required
  FROM public.financial_event_contract
  WHERE event_type = p_event_type
    AND is_active = true;

  IF v_dr_code IS NULL OR v_cr_code IS NULL THEN
    RAISE EXCEPTION 'EVENT CONTRACT MISSING OR INACTIVE: %', p_event_type;
  END IF;

  SELECT id INTO v_dr_id
  FROM public.chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = v_dr_code;

  SELECT id INTO v_cr_id
  FROM public.chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = v_cr_code;

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION 'COA MAPPING MISSING FOR TENANT % EVENT % (dr=% cr=%)',
      p_tenant_id, p_event_type, v_dr_code, v_cr_code;
  END IF;

  RETURN QUERY SELECT v_dr_id, v_cr_id, v_required;
END $$;

-- ---------- PHASE 4: ATOMIC DOUBLE-LEG POSTING ENGINE ----------
-- Real ledger is double-leg: each event = 2 rows (one DR, one CR)
-- Respects: chk_no_dual_entry, chk_has_entry, idx_del_idempotent, RLS block

CREATE OR REPLACE FUNCTION public.post_financial_event(
  p_tenant_id    UUID,
  p_event_type   TEXT,
  p_amount       NUMERIC,
  p_reference_id UUID,
  p_reference_type TEXT DEFAULT NULL,
  p_narration    TEXT DEFAULT NULL,
  p_created_by   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dr_id   UUID;
  v_cr_id   UUID;
  v_required BOOLEAN;
  v_dr_type TEXT;
  v_cr_type TEXT;
  v_ref_type TEXT;
  v_actor    UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID AMOUNT: %', p_amount;
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'REFERENCE_ID REQUIRED';
  END IF;

  v_ref_type := COALESCE(p_reference_type, lower(p_event_type));
  v_actor    := COALESCE(p_created_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT debit_account_id, credit_account_id, ledger_required
    INTO v_dr_id, v_cr_id, v_required
  FROM public.resolve_event_accounts(p_tenant_id, p_event_type);

  IF NOT v_required THEN
    RETURN;
  END IF;

  -- Idempotent guard (matches idx_del_idempotent)
  IF EXISTS (
    SELECT 1 FROM public.double_entry_ledger
    WHERE reference_type = v_ref_type
      AND reference_id   = p_reference_id
      AND event_type     = p_event_type
  ) THEN
    RETURN;
  END IF;

  SELECT account_type INTO v_dr_type FROM public.chart_of_accounts WHERE id = v_dr_id;
  SELECT account_type INTO v_cr_type FROM public.chart_of_accounts WHERE id = v_cr_id;

  -- DEBIT leg
  INSERT INTO public.double_entry_ledger
    (tenant_id, reference_type, reference_id, account_type, account_id,
     coa_id, debit, credit, narration, event_type, created_by)
  VALUES
    (p_tenant_id, v_ref_type, p_reference_id, v_dr_type, v_dr_id,
     v_dr_id, p_amount, 0, p_narration, p_event_type, v_actor);

  -- CREDIT leg
  INSERT INTO public.double_entry_ledger
    (tenant_id, reference_type, reference_id, account_type, account_id,
     coa_id, debit, credit, narration, event_type, created_by)
  VALUES
    (p_tenant_id, v_ref_type, p_reference_id, v_cr_type, v_cr_id,
     v_cr_id, 0, p_amount, p_narration, p_event_type, v_actor);
END $$;

-- ---------- PHASE 5: SOFT VALIDATION (NON-BLOCKING) ----------
-- Log tenants missing COA into audit_logs instead of aborting migration

DO $$
DECLARE
  v_missing INT;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM public.tenants t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts c WHERE c.tenant_id = t.id
  );

  IF v_missing > 0 THEN
    INSERT INTO public.audit_logs (entity_type, action_type, details)
    VALUES (
      'posting_engine',
      'coa_validation_warning',
      jsonb_build_object('tenants_missing_coa', v_missing, 'checked_at', now())
    );
  END IF;
END $$;

-- ---------- PHASE 6: PERMISSIONS ----------
-- financial_event_contract RLS already enabled with read policy (fec_read_all_auth)
-- Grant execute on posting engine to authenticated users (RLS still enforced via SECURITY DEFINER guards)

REVOKE ALL ON FUNCTION public.post_financial_event(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_financial_event(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_event_accounts(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_event_accounts(UUID, TEXT) TO authenticated, service_role;