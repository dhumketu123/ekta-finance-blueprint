
CREATE OR REPLACE FUNCTION public.fn_prevent_recovery_loop()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.recovery_attempts >= NEW.max_recovery_attempts THEN
    NEW.processing := false;
    NEW.stuck_reason := 'FAILED_PERMANENT';
    NEW.last_error := COALESCE(NEW.last_error, '') || ' [PERMANENT_FAIL: max recovery exceeded]';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recovery_guard ON public.ledger_guard_queue;
CREATE TRIGGER trg_recovery_guard
  BEFORE UPDATE ON public.ledger_guard_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_recovery_loop();
