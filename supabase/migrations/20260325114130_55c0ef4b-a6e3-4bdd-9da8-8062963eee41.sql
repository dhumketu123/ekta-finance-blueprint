
-- ═══════════════════════════════════════════════════════════
-- UPGRADE 1: HARDEN ACCOUNTING RPCs WITH STRICT TENANT ISOLATION
-- Force tenant_id from session only (ignore p_tenant_id param to prevent spoofing)
-- Add del.tenant_id filter on all ledger JOINs
-- ═══════════════════════════════════════════════════════════

-- 1A: get_trial_balance — hardened
CREATE OR REPLACE FUNCTION public.get_trial_balance(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, total_debit numeric, total_credit numeric, balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v_tid uuid;
BEGIN
  -- Always resolve from session, ignore p_tenant_id to prevent spoofing
  v_tid := get_user_tenant_id();
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    COALESCE(SUM(del.debit),0), COALESCE(SUM(del.credit),0),
    COALESCE(SUM(del.debit),0) - COALESCE(SUM(del.credit),0)
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id = coa.id AND del.tenant_id = v_tid
  WHERE coa.tenant_id = v_tid AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY coa.code;
END;
$$;

-- 1B: get_profit_loss — hardened
CREATE OR REPLACE FUNCTION public.get_profit_loss(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, amount numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := get_user_tenant_id();
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    CASE WHEN coa.account_type='income' THEN COALESCE(SUM(del.credit-del.debit),0)
         WHEN coa.account_type='expense' THEN COALESCE(SUM(del.debit-del.credit),0)
         ELSE 0 END
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id=coa.id
    AND del.tenant_id = v_tid
    AND (p_from IS NULL OR del.created_at >= p_from::timestamptz)
    AND (p_to IS NULL OR del.created_at < (p_to + interval '1 day')::timestamptz)
  WHERE coa.tenant_id=v_tid AND coa.account_type IN ('income','expense') AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY coa.account_type, coa.code;
END;
$$;

-- 1C: get_balance_sheet — hardened
CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of date DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(coa_id uuid, code text, name text, name_bn text, account_type text, balance numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := get_user_tenant_id();
  RETURN QUERY
  SELECT coa.id, coa.code, coa.name, coa.name_bn, coa.account_type,
    CASE WHEN coa.account_type='asset' THEN COALESCE(SUM(del.debit-del.credit),0)
         WHEN coa.account_type IN ('liability','equity') THEN COALESCE(SUM(del.credit-del.debit),0)
         ELSE 0 END
  FROM chart_of_accounts coa
  LEFT JOIN double_entry_ledger del ON del.coa_id=coa.id
    AND del.tenant_id = v_tid
    AND (p_as_of IS NULL OR del.created_at <= (p_as_of + interval '1 day')::timestamptz)
  WHERE coa.tenant_id=v_tid AND coa.account_type IN ('asset','liability','equity') AND coa.is_active
  GROUP BY coa.id, coa.code, coa.name, coa.name_bn, coa.account_type
  ORDER BY CASE coa.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 END, coa.code;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- UPGRADE 2: DOUBLE-ENTRY VALIDATION TRIGGER
-- Validates SUM(debit) = SUM(credit) per reference_id batch
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_double_entry_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  -- Only validate if reference_id is set (batch entries share a reference_id)
  IF NEW.reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate totals for this batch (including the new row being inserted)
  SELECT
    COALESCE(SUM(debit), 0) + NEW.debit,
    COALESCE(SUM(credit), 0) + NEW.credit
  INTO v_total_debit, v_total_credit
  FROM double_entry_ledger
  WHERE reference_id = NEW.reference_id
    AND id != NEW.id;

  -- We only validate when the batch is "complete" (has at least one prior entry)
  -- A single-row insert means the counterpart hasn't arrived yet
  IF EXISTS (SELECT 1 FROM double_entry_ledger WHERE reference_id = NEW.reference_id AND id != NEW.id) THEN
    IF v_total_debit != v_total_credit THEN
      RAISE EXCEPTION 'Double-entry violation: Debits (%) must equal Credits (%) for reference_id %',
        v_total_debit, v_total_credit, NEW.reference_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create a constraint trigger that fires AFTER INSERT (deferred to end of statement)
DROP TRIGGER IF EXISTS trg_validate_double_entry ON public.double_entry_ledger;

CREATE CONSTRAINT TRIGGER trg_validate_double_entry
AFTER INSERT ON public.double_entry_ledger
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_double_entry_balance();
