
-- =============================================
-- CRITICAL TRIGGERS: Ledger Hash Chain + Anomaly Detection + Risk Event Immutability
-- =============================================

-- 1. Ledger Hash Chain Trigger (BEFORE INSERT)
-- Auto-generates SHA256 hash chain for every new ledger entry
CREATE OR REPLACE TRIGGER trg_generate_ledger_hash
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ledger_entry_hash();

-- 2. Anomaly Detection Trigger (AFTER INSERT)
-- Auto-detects UNUSUAL_PAYMENT_SPIKE and RAPID_TRANSACTIONS
CREATE OR REPLACE TRIGGER trg_anomaly_detection
  AFTER INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_anomaly_on_ledger_entry();

-- 3. Risk Event Immutability Trigger
-- Prevents UPDATE/DELETE on risk_events (append-only audit log)
CREATE OR REPLACE FUNCTION public.prevent_risk_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow resolving alerts (only resolved, resolved_at, resolved_by fields)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.event_type = NEW.event_type
      AND OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id
      AND OLD.officer_id IS NOT DISTINCT FROM NEW.officer_id
      AND OLD.risk_score = NEW.risk_score
      AND OLD.reason IS NOT DISTINCT FROM NEW.reason
      AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
      AND OLD.created_at = NEW.created_at
      AND NEW.resolved = TRUE
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'risk_events are immutable — only resolution updates allowed';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'risk_events cannot be deleted — append-only audit log';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER prevent_risk_event_mutation
  BEFORE UPDATE OR DELETE ON public.risk_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_risk_event_mutation();

-- 4. Add unique constraint for officer_risk_profile upsert (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'officer_risk_profile_officer_period_uq'
  ) THEN
    ALTER TABLE public.officer_risk_profile
      ADD CONSTRAINT officer_risk_profile_officer_period_uq
      UNIQUE (officer_id, period_month);
  END IF;
END $$;
