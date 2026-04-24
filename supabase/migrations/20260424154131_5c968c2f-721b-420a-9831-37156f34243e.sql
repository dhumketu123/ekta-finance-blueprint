-- =========================================================
-- BANK-GRADE POSTING ENGINE — GAP FIX PATCH v3 (signature-aligned)
-- =========================================================

-- 1) HARD-FAIL CONTRACT RESOLVER (preserve existing signature)
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
  v_dr_id UUID;
  v_cr_id UUID;
BEGIN
  SELECT debit_account_code, credit_account_code, COALESCE(ledger_required, true)
  INTO v_dr_code, v_cr_code, v_required
  FROM public.financial_event_contract
  WHERE event_type = p_event_type
    AND is_active = true;

  IF v_dr_code IS NULL OR v_cr_code IS NULL THEN
    RAISE EXCEPTION
      'CONTRACT GAP: event_type % not defined in financial_event_contract',
      p_event_type;
  END IF;

  SELECT id INTO v_dr_id FROM public.chart_of_accounts
   WHERE tenant_id = p_tenant_id AND code = v_dr_code;

  SELECT id INTO v_cr_id FROM public.chart_of_accounts
   WHERE tenant_id = p_tenant_id AND code = v_cr_code;

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION
      'COA MAPPING MISSING: tenant=% event=% (dr=%, cr=%)',
      p_tenant_id, p_event_type, v_dr_code, v_cr_code;
  END IF;

  RETURN QUERY SELECT v_dr_id, v_cr_id, v_required;
END $$;

-- 2) LOCK DIRECT WRITE PATH
REVOKE INSERT ON public.double_entry_ledger FROM PUBLIC;
REVOKE INSERT ON public.double_entry_ledger FROM anon;
REVOKE INSERT ON public.double_entry_ledger FROM authenticated;

-- 3) PURE PASS-THROUGH WRAPPER
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
    'contract_driven'::text,
    NULL::text,
    p_actor
  );
END $$;

-- 4) CONTRACT INTEGRITY VALIDATOR
CREATE OR REPLACE FUNCTION public.validate_financial_contract_integrity()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing INT;
  v_self_post INT;
BEGIN
  SELECT COUNT(*) INTO v_missing
  FROM public.financial_event_contract c
  WHERE c.debit_account_code IS NULL
     OR c.credit_account_code IS NULL;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'CONTRACT BROKEN: % invalid mappings found', v_missing;
  END IF;

  SELECT COUNT(*) INTO v_self_post
  FROM public.financial_event_contract c
  WHERE c.debit_account_code = c.credit_account_code;

  IF v_self_post > 0 THEN
    RAISE EXCEPTION 'CONTRACT BROKEN: % self-posting mappings found', v_self_post;
  END IF;
END $$;

SELECT public.validate_financial_contract_integrity();

-- 5) FORBIDDEN-ENGINE GUARD
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'insert_double_entry_ledger'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN ENGINE DETECTED: direct ledger insert function exists';
  END IF;
END $$;

-- 6) GRANTS
GRANT EXECUTE ON FUNCTION public.post_event(UUID, TEXT, NUMERIC, UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_event_accounts(UUID, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_financial_contract_integrity()
  TO authenticated, service_role;