DO $$
DECLARE
  _definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO _definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'approve_financial_transaction'
  LIMIT 1;

  IF _definition IS NULL THEN
    RAISE EXCEPTION 'approve_financial_transaction function not found';
  END IF;

  _definition := replace(
    _definition,
    '(SELECT account_type::text FROM public.accounts WHERE id = (_entry->>''account_id'')::uuid)',
    '(SELECT account_type FROM public.accounts WHERE id = (_entry->>''account_id'')::uuid)'
  );

  IF _definition NOT LIKE '%(SELECT account_type FROM public.accounts WHERE id = (_entry->>''account_id'')::uuid)%' THEN
    RAISE EXCEPTION 'expected account_type patch was not applied';
  END IF;

  EXECUTE _definition;
END
$$;