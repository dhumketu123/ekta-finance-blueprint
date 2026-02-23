
-- PHASE 1 FINAL HARDENING: Audit Logs Immutability

CREATE OR REPLACE FUNCTION public.prevent_audit_logs_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit logs are immutable — cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs are immutable — cannot be deleted';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_audit_logs_edit
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_modification();
