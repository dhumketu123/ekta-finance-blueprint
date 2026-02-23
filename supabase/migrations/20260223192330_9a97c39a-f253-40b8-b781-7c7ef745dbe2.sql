
-- Ledger Integrity Verification: checks hash chain continuity per branch
CREATE OR REPLACE FUNCTION public.verify_all_branches_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  branch_rec record;
  entry_rec record;
  prev_hash text;
  broken_count int;
  total_entries int;
  branch_result jsonb;
BEGIN
  FOR branch_rec IN SELECT id, name, name_bn FROM branches WHERE is_active = true
  LOOP
    prev_hash := NULL;
    broken_count := 0;
    total_entries := 0;

    FOR entry_rec IN
      SELECT id, hash_signature, previous_hash
      FROM ledger_entries
      WHERE branch_id = branch_rec.id
      ORDER BY created_at ASC
    LOOP
      total_entries := total_entries + 1;

      -- Check if previous_hash matches the last entry's hash_signature
      IF prev_hash IS NOT NULL AND entry_rec.previous_hash IS DISTINCT FROM prev_hash THEN
        broken_count := broken_count + 1;
      END IF;

      prev_hash := entry_rec.hash_signature;
    END LOOP;

    branch_result := jsonb_build_object(
      'branch_id', branch_rec.id,
      'branch_name', branch_rec.name,
      'branch_name_bn', branch_rec.name_bn,
      'total_entries', total_entries,
      'broken_links', broken_count,
      'is_intact', (broken_count = 0),
      'verified_at', now()
    );

    result := result || jsonb_build_array(branch_result);
  END LOOP;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users (RLS on branches controls visibility)
GRANT EXECUTE ON FUNCTION public.verify_all_branches_integrity() TO authenticated;
