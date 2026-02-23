
-- PHASE 2.1: Commitment Core

-- 1. Enum for commitment status
CREATE TYPE public.commitment_status AS ENUM ('pending', 'fulfilled', 'rescheduled');

-- 2. Commitments table
CREATE TABLE public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL,
  commitment_date DATE NOT NULL,
  status public.commitment_status NOT NULL DEFAULT 'pending',
  reschedule_reason TEXT,
  audit_hash_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_commitment_date UNIQUE (client_id, commitment_date)
);

-- 3. Index for officer queries
CREATE INDEX idx_commitments_officer ON public.commitments(officer_id);
CREATE INDEX idx_commitments_client ON public.commitments(client_id);
CREATE INDEX idx_commitments_date_status ON public.commitments(commitment_date, status);

-- 4. RLS
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access commitments"
  ON public.commitments FOR ALL
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Field officers manage own commitments"
  ON public.commitments FOR ALL
  USING (is_field_officer() AND officer_id = auth.uid())
  WITH CHECK (is_field_officer() AND officer_id = auth.uid());

CREATE POLICY "Treasurer view commitments"
  ON public.commitments FOR SELECT
  USING (is_treasurer());

-- 5. Hash signature trigger
CREATE OR REPLACE FUNCTION public.compute_commitment_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.audit_hash_signature := encode(
    digest(
      COALESCE(NEW.client_id::text, '') || '|' ||
      COALESCE(NEW.officer_id::text, '') || '|' ||
      COALESCE(NEW.commitment_date::text, '') || '|' ||
      COALESCE(NEW.status::text, '') || '|' ||
      COALESCE(NEW.reschedule_reason, ''),
      'sha256'
    ),
    'hex'
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commitment_hash
  BEFORE INSERT OR UPDATE ON public.commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_commitment_hash();

-- 6. Status transition enforcement
CREATE OR REPLACE FUNCTION public.enforce_commitment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Cannot revert fulfilled/rescheduled back to pending
    IF OLD.status IN ('fulfilled', 'rescheduled') AND NEW.status = 'pending' THEN
      RAISE EXCEPTION 'Cannot revert commitment status from % to pending', OLD.status;
    END IF;
    -- pending can only go to fulfilled or rescheduled
    IF OLD.status = 'pending' AND NEW.status NOT IN ('fulfilled', 'rescheduled') THEN
      RAISE EXCEPTION 'Invalid commitment status transition from pending to %', NEW.status;
    END IF;
    -- rescheduled requires reason
    IF NEW.status = 'rescheduled' AND (NEW.reschedule_reason IS NULL OR trim(NEW.reschedule_reason) = '') THEN
      RAISE EXCEPTION 'Reschedule reason is required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commitment_status_check
  BEFORE UPDATE ON public.commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_commitment_status_transition();

-- 7. Audit logging trigger
CREATE OR REPLACE FUNCTION public.audit_commitment_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, new_value)
    VALUES ('create', 'commitments', NEW.id, auth.uid(), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, previous_value, new_value)
    VALUES ('update', 'commitments', NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_commitment_audit
  AFTER INSERT OR UPDATE ON public.commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_commitment_changes();

-- 8. Feature flag
INSERT INTO public.feature_flags (feature_name, is_enabled, enabled_for_role, description)
VALUES ('commitment_core', true, 'all', 'Phase 2.1 — Smart commitment tracking for client payment promises');
