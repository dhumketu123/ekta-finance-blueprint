
-- Fix compute_commitment_hash to use extensions.digest
CREATE OR REPLACE FUNCTION public.compute_commitment_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
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
