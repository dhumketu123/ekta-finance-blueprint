
-- PHASE 8: Immutable Ledger Hash Chain Enhancement

-- 1. Add previous_hash column to ledger_entries for chain linking
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS previous_hash text;

-- 2. Create hash chain trigger for ledger_entries
CREATE OR REPLACE FUNCTION public.generate_ledger_entry_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  prev_hash TEXT;
BEGIN
  -- Get the last hash in this branch's chain
  SELECT hash_signature INTO prev_hash
  FROM public.ledger_entries
  WHERE branch_id = NEW.branch_id
  ORDER BY created_at DESC
  LIMIT 1;

  NEW.previous_hash := COALESCE(prev_hash, 'GENESIS');

  -- Generate SHA256 hash of: previous_hash + key fields + timestamp
  NEW.hash_signature := encode(
    digest(
      COALESCE(prev_hash, 'GENESIS') ||
      NEW.branch_id::text ||
      NEW.account_id::text ||
      COALESCE(NEW.reference_id::text, '') ||
      NEW.amount::text ||
      NEW.entry_type::text ||
      NEW.reference_type ||
      NEW.created_by::text ||
      NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS ledger_entry_hash_chain_trigger ON public.ledger_entries;
CREATE TRIGGER ledger_entry_hash_chain_trigger
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ledger_entry_hash();

-- 3. Verify ledger integrity per branch (hash chain validation)
CREATE OR REPLACE FUNCTION public.verify_ledger_integrity(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec RECORD;
  expected_hash TEXT;
  prev TEXT := 'GENESIS';
  total_count INT := 0;
  broken_count INT := 0;
  first_broken_id uuid := NULL;
BEGIN
  FOR rec IN
    SELECT * FROM public.ledger_entries
    WHERE branch_id = p_branch_id
    ORDER BY created_at ASC
  LOOP
    total_count := total_count + 1;

    expected_hash := encode(
      digest(
        prev ||
        rec.branch_id::text ||
        rec.account_id::text ||
        COALESCE(rec.reference_id::text, '') ||
        rec.amount::text ||
        rec.entry_type::text ||
        rec.reference_type ||
        rec.created_by::text ||
        rec.created_at::text,
        'sha256'
      ),
      'hex'
    );

    IF rec.hash_signature IS DISTINCT FROM expected_hash THEN
      broken_count := broken_count + 1;
      IF first_broken_id IS NULL THEN
        first_broken_id := rec.id;
      END IF;
    END IF;

    prev := rec.hash_signature;
  END LOOP;

  RETURN jsonb_build_object(
    'integrity', CASE WHEN broken_count = 0 THEN 'valid' ELSE 'compromised' END,
    'total_entries', total_count,
    'broken_links', broken_count,
    'first_broken_id', first_broken_id,
    'verified_at', now()
  );
END;
$$;

-- 4. Verify ALL branches at once (for daily cron)
CREATE OR REPLACE FUNCTION public.verify_all_branches_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  branch RECORD;
  result jsonb;
  all_results jsonb := '[]'::jsonb;
  any_broken boolean := false;
BEGIN
  FOR branch IN SELECT id, name FROM public.branches WHERE is_active = true
  LOOP
    result := public.verify_ledger_integrity(branch.id);
    all_results := all_results || jsonb_build_array(
      result || jsonb_build_object('branch_id', branch.id, 'branch_name', branch.name)
    );
    IF (result->>'integrity') = 'compromised' THEN
      any_broken := true;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'overall_integrity', CASE WHEN any_broken THEN 'compromised' ELSE 'valid' END,
    'branches', all_results,
    'verified_at', now()
  );
END;
$$;
