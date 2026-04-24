-- =========================================================
-- FINANCIAL CORE LOCKDOWN — surgical, schema-aligned (v2)
-- =========================================================

-- 1) Re-affirm event contract (idempotent; aligns INTEREST/PENALTY aliases)
INSERT INTO public.financial_event_contract
  (event_type, debit_account_code, credit_account_code, description)
VALUES
  ('LOAN_DISBURSE',    '1101', '1001', 'Loan Receivable Dr / Cash Cr'),
  ('LOAN_REPAYMENT',   '1001', '1101', 'Cash Dr / Loan Receivable Cr'),
  ('INTEREST_PAYMENT', '1001', '4001', 'Cash Dr / Interest Income Cr'),
  ('INTEREST',         '1001', '4001', 'Alias: Cash Dr / Interest Income Cr'),
  ('PENALTY_PAYMENT',  '1001', '4002', 'Cash Dr / Penalty Income Cr'),
  ('PENALTY',          '1001', '4002', 'Alias: Cash Dr / Penalty Income Cr'),
  ('DPS_DEPOSIT',      '1001', '2001', 'Cash Dr / DPS Liability Cr'),
  ('DPS_WITHDRAW',     '2001', '1001', 'DPS Liability Dr / Cash Cr')
ON CONFLICT (event_type) DO UPDATE
SET debit_account_code  = EXCLUDED.debit_account_code,
    credit_account_code = EXCLUDED.credit_account_code,
    description         = EXCLUDED.description,
    updated_at          = now();

-- 2) Thin alias `post_event` -> production engine `post_financial_event`
CREATE OR REPLACE FUNCTION public.post_event(
  p_tenant_id    UUID,
  p_event_type   TEXT,
  p_amount       NUMERIC,
  p_reference_id UUID,
  p_actor        UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_financial_event(
    p_tenant_id,
    p_event_type,
    p_amount,
    p_reference_id,
    'manual'::text,
    NULL::text,
    p_actor
  );
END $$;

-- 3) Lock direct write path — only SECURITY DEFINER engine can insert
REVOKE INSERT ON public.double_entry_ledger FROM PUBLIC;
REVOKE INSERT ON public.double_entry_ledger FROM authenticated;
REVOKE INSERT ON public.double_entry_ledger FROM anon;

-- 4) Allow callers to invoke the engines (DEFINER context handles the insert)
GRANT EXECUTE ON FUNCTION public.post_event(UUID, TEXT, NUMERIC, UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_financial_event(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT, UUID)
  TO authenticated, service_role;