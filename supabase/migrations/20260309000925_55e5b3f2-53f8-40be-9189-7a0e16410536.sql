
CREATE OR REPLACE FUNCTION public.create_investor_weekly_transaction(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_result_id uuid;
  v_investor_id uuid;
  v_type text;
  v_amount numeric;
  v_weeks integer;
  v_base_date date;
  v_weekly_share numeric;
BEGIN
  v_tenant_id := get_user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context not found';
  END IF;

  v_investor_id := (p_data->>'investor_id')::uuid;
  v_type        := p_data->>'type';
  v_amount      := (p_data->>'amount')::numeric;

  -- ── 1. Amount validation ──────────────────────────────────────────────────
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- ── 2. Type validation — now supports 5 types ─────────────────────────────
  IF v_type NOT IN ('weekly', 'capital', 'extra_capital', 'penalty', 'adjustment') THEN
    RAISE EXCEPTION 'Invalid transaction type: %. Allowed: weekly, capital, extra_capital, penalty, adjustment', v_type;
  END IF;

  -- ── 3. Investor existence check ───────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM investors
    WHERE id = v_investor_id
      AND tenant_id = v_tenant_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Investor not found or access denied';
  END IF;

  -- ── 4. Weekly-specific: fetch share rate & compute weeks covered ──────────
  IF v_type = 'weekly' THEN
    SELECT COALESCE(weekly_share, 100)
    INTO v_weekly_share
    FROM investors
    WHERE id = v_investor_id;

    IF v_weekly_share <= 0 THEN
      v_weekly_share := 100;
    END IF;

    IF v_amount % v_weekly_share != 0 THEN
      RAISE EXCEPTION 'Weekly amount must be a multiple of the weekly share (৳%)', v_weekly_share;
    END IF;

    v_weeks := (v_amount / v_weekly_share)::integer;

    IF v_weeks <= 0 THEN
      RAISE EXCEPTION 'Invalid weeks calculation';
    END IF;
  ELSE
    v_weeks := 0;
  END IF;

  -- ── 5. Insert transaction log ─────────────────────────────────────────────
  INSERT INTO investor_weekly_transactions (
    investor_id, type, amount, weeks_covered,
    transaction_date, notes, created_by, tenant_id
  )
  VALUES (
    v_investor_id,
    v_type,
    v_amount,
    v_weeks,
    COALESCE((p_data->>'transaction_date')::date, CURRENT_DATE),
    p_data->>'notes',
    auth.uid(),
    v_tenant_id
  )
  RETURNING id INTO v_result_id;

  -- ── 6. Financial side-effects per type ────────────────────────────────────

  IF v_type = 'weekly' THEN
    -- Advance weekly_paid_until relative to the later of today or current expiry
    SELECT GREATEST(
      COALESCE(weekly_paid_until, CURRENT_DATE),
      CURRENT_DATE
    )
    INTO v_base_date
    FROM investors
    WHERE id = v_investor_id;

    UPDATE investors
    SET total_weekly_paid  = total_weekly_paid + v_amount,
        weekly_paid_until  = v_base_date + (v_weeks * INTERVAL '7 days'),
        updated_at         = now()
    WHERE id = v_investor_id;

  ELSIF v_type IN ('capital', 'extra_capital', 'adjustment') THEN
    -- All three types increment core capital
    UPDATE investors
    SET capital    = capital + v_amount,
        updated_at = now()
    WHERE id = v_investor_id;

  ELSIF v_type = 'penalty' THEN
    -- Penalty: transaction logged only — capital is NOT touched
    NULL;

  END IF;

  RETURN v_result_id;
END;
$function$;
