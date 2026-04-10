
-- 1. CENTRAL AUDIT EXECUTION WRAPPER
CREATE OR REPLACE FUNCTION public.fn_execute_audit_safe(p_batch_size int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_safe_audit_guard() THEN
    RETURN jsonb_build_object(
      'status', 'BLOCKED',
      'reason', 'AUDIT_FROZEN_OR_DISABLED'
    );
  END IF;

  RETURN public.fn_run_delta_audit();
END;
$$;

-- 2. MUTATION SAFETY TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.fn_audit_write_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_safe_audit_guard() THEN
    RAISE EXCEPTION 'AUDIT SYSTEM FROZEN - WRITE BLOCKED';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. ATTACH WRITE GUARD TO AUDIT TABLES
CREATE TRIGGER trg_audit_write_guard_verification
BEFORE INSERT OR UPDATE ON public.audit_verification_state
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_write_guard();

CREATE TRIGGER trg_audit_write_guard_truth_registry
BEFORE INSERT OR UPDATE ON public.truth_authority_registry
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_write_guard();
