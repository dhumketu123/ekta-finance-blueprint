
-- Function dependency introspection: returns table names referenced by a given function
CREATE OR REPLACE FUNCTION public.get_function_dependencies(_function_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  func_body text;
BEGIN
  -- Get function source
  SELECT prosrc INTO func_body
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = _function_name
  LIMIT 1;

  IF func_body IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Find all public table names referenced in the function body
  SELECT jsonb_agg(DISTINCT t.table_name) INTO result
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND func_body ILIKE '%' || t.table_name || '%';

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Enable realtime for knowledge graph
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_knowledge_graph;
