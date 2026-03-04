-- STEP 1: Drop duplicate/risky policy
DROP POLICY IF EXISTS "Admin/owner full access investor_weekly_transactions"
ON public.investor_weekly_transactions;

-- STEP 2: Replace secure transaction RPC (hardened)
CREATE OR REPLACE FUNCTION public.create_investor_weekly_transaction(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_result_id uuid;
  v_investor_id uuid;
  v_type text;
  v_amount numeric;
  v_weeks integer;
  v_base_date date;
BEGIN
  v_tenant_id := get_user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context not found';
  END IF;

  v_investor_id := (p_data->>'investor_id')::uuid;
  v_type := p_data->>'type';
  v_amount := (p_data->>'amount')::numeric;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF v_type NOT IN ('weekly','capital') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM investors
    WHERE id = v_investor_id
      AND tenant_id = v_tenant_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Investor not found or access denied';
  END IF;

  IF v_type = 'weekly' THEN
    IF v_amount % 100 != 0 THEN
      RAISE EXCEPTION 'Weekly amount must be multiple of 100';
    END IF;

    v_weeks := (v_amount / 100)::integer;

    IF v_weeks <= 0 THEN
      RAISE EXCEPTION 'Invalid weeks calculation';
    END IF;
  ELSE
    v_weeks := 0;
  END IF;

  INSERT INTO investor_weekly_transactions (
    investor_id, type, amount, weeks_covered,
    transaction_date, notes, created_by, tenant_id
  )
  VALUES (
    v_investor_id, v_type, v_amount, v_weeks,
    COALESCE((p_data->>'transaction_date')::date, CURRENT_DATE),
    p_data->>'notes', auth.uid(), v_tenant_id
  )
  RETURNING id INTO v_result_id;

  IF v_type = 'weekly' THEN
    SELECT GREATEST(
      COALESCE(weekly_paid_until, CURRENT_DATE),
      CURRENT_DATE
    )
    INTO v_base_date
    FROM investors
    WHERE id = v_investor_id;

    UPDATE investors
    SET total_weekly_paid = total_weekly_paid + v_amount,
        weekly_paid_until = v_base_date + (v_weeks * INTERVAL '7 days'),
        updated_at = now()
    WHERE id = v_investor_id;

  ELSIF v_type = 'capital' THEN
    UPDATE investors
    SET capital = capital + v_amount,
        updated_at = now()
    WHERE id = v_investor_id;
  END IF;

  RETURN v_result_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_investor_weekly_transaction(jsonb)
TO authenticated;