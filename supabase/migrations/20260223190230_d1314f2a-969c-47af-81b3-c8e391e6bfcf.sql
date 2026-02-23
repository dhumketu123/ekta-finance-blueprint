
-- Fix search_path on prevent_risk_event_mutation
CREATE OR REPLACE FUNCTION prevent_risk_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.resolved IS DISTINCT FROM OLD.resolved OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN
      IF NEW.event_type <> OLD.event_type OR NEW.risk_score <> OLD.risk_score OR NEW.reason IS DISTINCT FROM OLD.reason
         OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.officer_id IS DISTINCT FROM OLD.officer_id THEN
        RAISE EXCEPTION 'Cannot modify risk event core fields';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only resolution updates allowed on risk_events';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Cannot delete risk events'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;
