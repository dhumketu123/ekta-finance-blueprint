-- Step E: Replace existing period lock trigger with enforce_period_lock
CREATE OR REPLACE FUNCTION public.enforce_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT is_locked INTO v_locked
  FROM accounting_periods
  WHERE period_month = date_trunc('month', NEW.created_at)::date;

  IF v_locked IS TRUE THEN
    RAISE EXCEPTION 'This accounting period is locked. Cannot insert ledger entry for %', to_char(NEW.created_at, 'YYYY-MM');
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_check_period_lock ON public.double_entry_ledger;
DROP TRIGGER IF EXISTS trg_period_lock ON public.double_entry_ledger;

CREATE TRIGGER trg_period_lock
BEFORE INSERT ON public.double_entry_ledger
FOR EACH ROW
EXECUTE FUNCTION public.enforce_period_lock();

-- Step F: Fix audit_logs RLS - drop overly permissive policy
DROP POLICY IF EXISTS "Authenticated can view audit_logs" ON public.audit_logs;

-- Add tenant-scoped audit read (branch_id based since audit_logs doesn't have tenant_id directly)
-- audit_logs already has admin/owner and treasurer policies, so we just removed the open one
