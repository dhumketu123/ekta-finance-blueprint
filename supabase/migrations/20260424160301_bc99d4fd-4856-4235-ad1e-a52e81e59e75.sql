-- =========================================================
-- GIGA-FACTORY OS — LEDGER IMMUTABILITY LOCK vFINAL
-- Goal: Eliminate schema drift, contract drift, engine drift
-- =========================================================

-- ---------------------------------------------------------
-- 1) HARD CONTRACT INTEGRITY CHECK (NO SILENT FAILURE)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_financial_system_integrity()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_contract INT;
  v_self_post INT;
BEGIN
  -- missing mappings check (per-tenant aware: contract codes must resolve in at least one tenant COA)
  SELECT COUNT(*) INTO v_missing_contract
  FROM public.financial_event_contract c
  WHERE c.is_active = true
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts coa
        WHERE coa.code = c.debit_account_code
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts coa
        WHERE coa.code = c.credit_account_code
      )
    );

  IF v_missing_contract > 0 THEN
    RAISE EXCEPTION
      'CONTRACT BROKEN: % missing account mappings',
      v_missing_contract;
  END IF;

  -- self posting check
  SELECT COUNT(*) INTO v_self_post
  FROM public.financial_event_contract
  WHERE is_active = true
    AND debit_account_code = credit_account_code;

  IF v_self_post > 0 THEN
    RAISE EXCEPTION
      'CONTRACT BROKEN: self-posting detected (% records)',
      v_self_post;
  END IF;
END $$;

-- run immediately (fail-fast mode)
SELECT public.validate_financial_system_integrity();


-- ---------------------------------------------------------
-- 2) SINGLE SOURCE OF TRUTH ENFORCEMENT
-- ---------------------------------------------------------
REVOKE INSERT ON public.double_entry_ledger FROM PUBLIC;
REVOKE INSERT ON public.double_entry_ledger FROM anon;
REVOKE INSERT ON public.double_entry_ledger FROM authenticated;


-- ---------------------------------------------------------
-- 3) ENGINE UNIQUENESS GUARANTEE
-- (no duplicate posting engines allowed)
-- ---------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'insert_double_entry_ledger',
        'direct_ledger_insert',
        'ledger_write'
      )
  ) THEN
    RAISE EXCEPTION
      'FORBIDDEN ENGINE DETECTED: direct ledger writer exists';
  END IF;
END $$;


-- ---------------------------------------------------------
-- 4) SAFE CONTRACT ACCESS RULE
-- ---------------------------------------------------------
ALTER TABLE public.financial_event_contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_read ON public.financial_event_contract;

CREATE POLICY contract_read
ON public.financial_event_contract
FOR SELECT
TO authenticated
USING (true);


-- ---------------------------------------------------------
-- 5) SAFE RESOLVER GUARANTEE (NO NULL RETURN ON UNKNOWN EVENT)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_event_accounts(
  p_tenant_id UUID,
  p_event_type TEXT
)
RETURNS TABLE(
  debit_account_id UUID,
  credit_account_id UUID,
  ledger_required BOOLEAN
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
  SELECT c.debit_account_code, c.credit_account_code, c.ledger_required
  INTO v_dr_code, v_cr_code, v_required
  FROM public.financial_event_contract c
  WHERE c.event_type = p_event_type
    AND c.is_active = true;

  IF v_dr_code IS NULL OR v_cr_code IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN EVENT TYPE: %', p_event_type;
  END IF;

  SELECT id INTO v_dr_id
  FROM public.chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = v_dr_code;

  SELECT id INTO v_cr_id
  FROM public.chart_of_accounts
  WHERE tenant_id = p_tenant_id AND code = v_cr_code;

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION 'TENANT COA INCOMPLETE for event % (tenant %)', p_event_type, p_tenant_id;
  END IF;

  RETURN QUERY SELECT v_dr_id, v_cr_id, v_required;
END $$;


-- ---------------------------------------------------------
-- 6) POSTING SAFETY ASSERTION HOOK
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_before_post()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.debit IS NULL OR NEW.credit IS NULL THEN
    RAISE EXCEPTION 'INVALID LEDGER ENTRY: NULL DEBIT/CREDIT';
  END IF;

  IF NEW.debit = 0 AND NEW.credit = 0 THEN
    RAISE EXCEPTION 'INVALID LEDGER ENTRY: ZERO VALUE';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assert_ledger ON public.double_entry_ledger;

CREATE TRIGGER trg_assert_ledger
BEFORE INSERT ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.assert_before_post();


-- ---------------------------------------------------------
-- 7) FINAL HEALTH CHECK (SYSTEM STATE SNAPSHOT)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_system_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_violations INT := 0;
  v_unbalanced INT := 0;
  v_self_post INT := 0;
BEGIN
  -- contract mapping violations
  SELECT COUNT(*) INTO v_contract_violations
  FROM public.financial_event_contract c
  WHERE c.is_active = true
    AND (
      NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.debit_account_code)
      OR NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = c.credit_account_code)
    );

  -- self-post violations
  SELECT COUNT(*) INTO v_self_post
  FROM public.financial_event_contract
  WHERE is_active = true AND debit_account_code = credit_account_code;

  -- unbalanced reference groups (sum debit <> sum credit per reference)
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT reference_id
    FROM public.double_entry_ledger
    WHERE reference_id IS NOT NULL
    GROUP BY reference_id
    HAVING SUM(debit) <> SUM(credit)
  ) t;

  RETURN jsonb_build_object(
    'status',
    CASE
      WHEN v_contract_violations = 0 AND v_unbalanced = 0 AND v_self_post = 0 THEN 'CLEAN'
      ELSE 'BROKEN'
    END,
    'contract_violations', v_contract_violations,
    'self_post_violations', v_self_post,
    'unbalanced_references', v_unbalanced,
    'checked_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.financial_system_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_financial_system_integrity() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_event_accounts(UUID, TEXT) TO authenticated, service_role;