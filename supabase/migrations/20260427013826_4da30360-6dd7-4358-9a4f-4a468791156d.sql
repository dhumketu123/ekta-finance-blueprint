CREATE OR REPLACE FUNCTION public.post_financial_event(
  p_tenant_id uuid, p_event_type text, p_amount numeric, p_reference_id uuid,
  p_reference_type text DEFAULT NULL::text, p_narration text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dr_id UUID;
  v_cr_id UUID;
  v_dr_type TEXT;
  v_cr_type TEXT;
  v_ref_type TEXT;
  v_actor UUID;
BEGIN
  PERFORM set_config('app.ledger_engine_bypass', 'on', true);

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'TLIS: invalid amount %', p_amount;
  END IF;

  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: reference_id required for idempotency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_reference_id::text || ':' || p_event_type));

  -- ★ Explicit idempotency check (no broken constraint reference)
  IF EXISTS (
    SELECT 1 FROM public.double_entry_ledger
    WHERE reference_id = p_reference_id AND event_type = p_event_type
  ) THEN
    RETURN;
  END IF;

  SELECT debit_account_id, credit_account_id INTO v_dr_id, v_cr_id
  FROM public.resolve_event_accounts(p_tenant_id, p_event_type);

  IF v_dr_id IS NULL OR v_cr_id IS NULL THEN
    RAISE EXCEPTION 'TLIS: COA mapping missing for tenant=% event=%', p_tenant_id, p_event_type;
  END IF;

  SELECT account_type INTO v_dr_type FROM public.chart_of_accounts WHERE id = v_dr_id;
  SELECT account_type INTO v_cr_type FROM public.chart_of_accounts WHERE id = v_cr_id;

  v_ref_type := COALESCE(p_reference_type, lower(p_event_type));
  v_actor := COALESCE(p_created_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  ) VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_dr_type, v_dr_id,
    v_dr_id, p_amount, 0, 0, p_narration, p_event_type, v_actor
  );

  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_type, account_id,
    coa_id, debit, credit, balance_after, narration, event_type, created_by
  ) VALUES (
    p_tenant_id, v_ref_type, p_reference_id, v_cr_type, v_cr_id,
    v_cr_id, 0, p_amount, 0, p_narration, p_event_type, v_actor
  );
END $function$;