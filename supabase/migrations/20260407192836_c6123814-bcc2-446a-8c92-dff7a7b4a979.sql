
-- Get all public tables with columns and foreign keys
CREATE OR REPLACE FUNCTION public.get_schema_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(t_row) INTO result
  FROM (
    SELECT
      t.table_name,
      (SELECT jsonb_agg(jsonb_build_object(
        'column_name', c.column_name,
        'data_type', c.data_type,
        'is_nullable', c.is_nullable
      ))
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t.table_name
      ) AS columns,
      (SELECT jsonb_agg(jsonb_build_object(
        'column_name', kcu.column_name,
        'referenced_table', ccu.table_name,
        'referenced_column', ccu.column_name
      ))
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = t.table_name
      ) AS foreign_keys,
      EXISTS(SELECT 1 FROM pg_tables pt WHERE pt.schemaname = 'public' AND pt.tablename = t.table_name AND pt.rowsecurity = true) AS has_rls
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  ) AS t_row;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Get all triggers
CREATE OR REPLACE FUNCTION public.get_schema_triggers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'trigger_name', trigger_name,
    'event_manipulation', event_manipulation,
    'event_object_table', event_object_table,
    'action_timing', action_timing,
    'action_statement', action_statement
  )) INTO result
  FROM information_schema.triggers
  WHERE trigger_schema = 'public';

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Get all public functions
CREATE OR REPLACE FUNCTION public.get_schema_functions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'routine_name', r.routine_name,
    'data_type', r.data_type,
    'security_type', r.security_type,
    'routine_language', r.external_language
  )) INTO result
  FROM information_schema.routines r
  WHERE r.routine_schema = 'public' AND r.routine_type = 'FUNCTION';

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
