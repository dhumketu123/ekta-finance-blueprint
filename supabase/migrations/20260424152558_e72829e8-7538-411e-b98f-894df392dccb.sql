/* =========================================================
   TITANIUM LEDGER INTEGRITY SYSTEM (TLIS v1.0)
   Schema-aligned: two-leg posting per event
   ========================================================= */

-- 1) COA SEED — already done in prior migrations; reaffirm idempotently
INSERT INTO public.chart_of_accounts (
  id, tenant_id, code, name, name_bn, account_type, is_active
)
SELECT
  gen_random_uuid(), t.id, v.code, v.name_en, v.name_bn, v.type, true
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('1001','Cash Account','ক্যাশ অ্যাকাউন্ট','asset'),
    ('1101','Loan Receivable','ঋণ পাওনা','asset'),
    ('2001','DPS Liability','ডিপিএস দায়','liability'),
    ('4001','Interest Income','সুদ আয়','income'),
    ('4002','Penalty Income','জরিমানা আয়','income'),
    ('9999','Suspense Account','সাসপেন্স অ্যাকাউন্ট','asset')
) v(code, name_en, name_bn, type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2) EVENT CONTRACT — reaffirm full TLIS event set
INSERT INTO public.financial_event_contract (
  event_type, debit_account_code, credit_account_code, ledger_required, is_active
) VALUES
  ('LOAN_DISBURSE','1101','1001', true, true),
  ('LOAN_REPAYMENT','1001','1101', true, true),
  ('INTEREST_PAYMENT','1001','4001', true, true),
  ('DPS_DEPOSIT','1001','2001', true, true),
  ('DPS_WITHDRAW','2001','1001', true, true),
  ('PENALTY_PAYMENT','1001','4002', true, true)
ON CONFLICT (event_type) DO UPDATE
SET debit_account_code = EXCLUDED.debit_account_code,
    credit_account_code = EXCLUDED.credit_account_code,
    ledger_required = EXCLUDED.ledger_required,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- 3) TLIS POSTING ENGINE v1.0 — schema-aligned two-leg writer
-- Replaces prior post_financial_event with full TLIS guarantees:
--   • Advisory lock (race protection)
--   • Two-leg insert respecting chk_no_dual_entry
--   • Idempotent via existing idx_del_idempotent
--   • Positive amount enforcement
--   • Contract-driven (no hardcoded codes)
CREATE OR REPLACE FUNCTION public.post_financial_event(
  p_tenant_id UUID,
  p_event_type TEXT,
  p_amount NUMERIC,
  p_reference_id UUID,
  p_reference_type TEXT DEFAULT NULL,
  p_narration TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dr_id UUID;
  v_cr_id UUID;
  v_dr_type TEXT;
  v_cr_type TEXT;
  v_ref_type TEXT;
  v_actor UUID;
BEGIN
  -- Hard guards
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'TLIS: invalid amount %', p_amount;
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: reference_id required for idempotency';
  END IF;

  -- Race condition lock (per reference)
  PERFORM pg_advisory_xact_lock(hashtext(p_reference_id::text || ':' || p_event_type));

  -- Resolve accounts via contract
  SELECT debit_account_id, credit_account_id
  INTO v_dr_id, v_cr_id
  FROM public.resolve_event_accounts(p_tenant_id, p_event_type);

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: COA mapping missing for tenant=% event=%', p_tenant_id, p_event_type;
  END IF;

  -- Pull account_type for each leg (required NOT NULL column)
  SELECT account_type INTO v_dr_type FROM public.chart_of_accounts WHERE id = v_dr_id;
  SELECT account_type INTO v_cr_type FROM public.chart_of_accounts WHERE id = v_cr_id;

  v_ref_type := COALESCE(p_reference_type, lower(p_event_type));
  v_actor := COALESCE(p_created_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  -- DEBIT leg (idempotent via idx_del_idempotent)
  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  )
  VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_dr_type, v_dr_id,
    v_dr_id, p_amount, 0, 0, p_narration, p_event_type, v_actor
  )
  ON CONFLICT ON CONSTRAINT idx_del_idempotent DO NOTHING;

  -- CREDIT leg
  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  )
  VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_cr_type, v_cr_id,
    v_cr_id, 0, p_amount, 0, p_narration, p_event_type, v_actor
  )
  ON CONFLICT ON CONSTRAINT idx_del_idempotent DO NOTHING;
END $$;

-- 4) RECONCILIATION VIEW — DR must equal CR per tenant (zero-sum invariant)
CREATE OR REPLACE VIEW public.ledger_reconciliation_check AS
SELECT
  tenant_id,
  SUM(debit)  AS total_debit,
  SUM(credit) AS total_credit,
  SUM(debit) - SUM(credit) AS imbalance,
  CASE WHEN SUM(debit) = SUM(credit) THEN 'BALANCED' ELSE 'IMBALANCED' END AS status
FROM public.double_entry_ledger
GROUP BY tenant_id;

-- 5) PERMISSIONS — only system path can post
GRANT EXECUTE ON FUNCTION public.post_financial_event(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- Direct INSERT already blocked at RLS level ("Block direct insert double_entry_ledger" WITH CHECK false)
-- No additional REVOKE needed; SECURITY DEFINER bypass is the only legal write path.