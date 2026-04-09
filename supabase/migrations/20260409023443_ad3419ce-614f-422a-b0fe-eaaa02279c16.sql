
CREATE OR REPLACE FUNCTION public.fn_generate_ai_insights_dry_run()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN jsonb_build_object(
        'callable', true,
        'note', 'Dry run validation only'
    );
END;
$$;
