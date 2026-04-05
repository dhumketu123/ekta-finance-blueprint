
CREATE OR REPLACE FUNCTION public.generate_event_hash(
  p_user_id uuid,
  p_event_type text,
  p_source_module text,
  p_reference text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN encode(
    extensions.digest(
      p_user_id::text || p_event_type || p_source_module || coalesce(p_reference, ''),
      'sha256'
    ),
    'hex'
  );
END;
$$;
