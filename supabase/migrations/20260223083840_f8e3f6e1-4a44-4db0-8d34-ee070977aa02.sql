
-- PHASE 2.2: Penalty Suspension Engine

-- 1. Add penalty_suspended flag to commitments
ALTER TABLE public.commitments
  ADD COLUMN penalty_suspended BOOLEAN NOT NULL DEFAULT false;

-- 2. Update hash function to include new column
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
      COALESCE(NEW.reschedule_reason, '') || '|' ||
      COALESCE(NEW.penalty_suspended::text, 'false'),
      'sha256'
    ),
    'hex'
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 3. Feature flag
INSERT INTO public.feature_flags (feature_name, is_enabled, enabled_for_role, description)
VALUES ('commitment_reschedule', true, 'all', 'Phase 2.2 — Penalty suspension on rescheduled commitments');

-- 4. Penalty suspension check function (used by check_and_apply_overdue_penalty)
CREATE OR REPLACE FUNCTION public.is_penalty_suspended(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commitments
    WHERE client_id = _client_id
      AND penalty_suspended = true
      AND status = 'rescheduled'
      AND commitment_date >= CURRENT_DATE
  );
$$;
