
-- ═══════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════

-- double_entry_ledger: READ only for tenant match
CREATE POLICY "Tenant read double_entry_ledger"
  ON public.double_entry_ledger FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Block direct INSERT — only via RPC
CREATE POLICY "Block direct insert double_entry_ledger"
  ON public.double_entry_ledger FOR INSERT TO authenticated
  WITH CHECK (false);

-- Admin read all within tenant
CREATE POLICY "Admin full double_entry_ledger"
  ON public.double_entry_ledger FOR ALL TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

-- account_balances: READ only
CREATE POLICY "Tenant read account_balances"
  ON public.account_balances FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Block direct mutations
CREATE POLICY "Block direct insert account_balances"
  ON public.account_balances FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update account_balances"
  ON public.account_balances FOR UPDATE TO authenticated
  USING (false);

-- Block anon
CREATE POLICY "Deny anon double_entry_ledger"
  ON public.double_entry_ledger FOR SELECT TO anon
  USING (false);

CREATE POLICY "Deny anon account_balances"
  ON public.account_balances FOR SELECT TO anon
  USING (false);

-- ═══════════════════════════════════════
-- PHASE 3: CORE LEDGER RPC
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_reference_type text,
  p_reference_id uuid,
  p_entries jsonb  -- array of {account_type, account_id, debit, credit, narration}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
  v_entry jsonb;
  v_debit numeric;
  v_credit numeric;
  v_account_type text;
  v_account_id uuid;
  v_narration text;
  v_current_balance numeric;
  v_new_balance numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_entry_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not authenticated';
  END IF;

  -- 2. Resolve tenant
  SELECT tenant_id INTO v_tenant_id
    FROM profiles WHERE id = v_user_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no tenant assigned';
  END IF;

  -- 3. Validate entries array
  IF p_entries IS NULL OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'No ledger entries provided';
  END IF;

  -- 4. Process each entry atomically
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_account_type := v_entry->>'account_type';
    v_account_id := (v_entry->>'account_id')::uuid;
    v_debit := COALESCE((v_entry->>'debit')::numeric, 0);
    v_credit := COALESCE((v_entry->>'credit')::numeric, 0);
    v_narration := v_entry->>'narration';

    -- Validate entry
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'Amounts cannot be negative';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'Entry cannot have both debit and credit';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'Entry must have debit or credit > 0';
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;

    -- 5. Lock and get/create account balance
    INSERT INTO account_balances (tenant_id, account_type, account_id, balance, updated_at)
      VALUES (v_tenant_id, v_account_type, v_account_id, 0, now())
      ON CONFLICT (tenant_id, account_type, account_id) DO NOTHING;

    SELECT balance INTO v_current_balance
      FROM account_balances
      WHERE tenant_id = v_tenant_id
        AND account_type = v_account_type
        AND account_id = v_account_id
      FOR UPDATE;

    -- 6. Calculate new balance
    v_new_balance := v_current_balance + v_credit - v_debit;

    -- 7. Insert ledger entry
    INSERT INTO double_entry_ledger (
      tenant_id, reference_type, reference_id,
      account_type, account_id,
      debit, credit, balance_after,
      narration, created_by
    ) VALUES (
      v_tenant_id, p_reference_type, p_reference_id,
      v_account_type, v_account_id,
      v_debit, v_credit, v_new_balance,
      v_narration, v_user_id
    ) RETURNING id INTO v_entry_id;

    -- 8. Update materialized balance
    UPDATE account_balances
      SET balance = v_new_balance,
          last_entry_id = v_entry_id,
          updated_at = now()
      WHERE tenant_id = v_tenant_id
        AND account_type = v_account_type
        AND account_id = v_account_id;

    v_results := v_results || jsonb_build_object(
      'entry_id', v_entry_id,
      'account_id', v_account_id,
      'balance_after', v_new_balance
    );
  END LOOP;

  -- 9. Verify double-entry: total debit MUST equal total credit
  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Double-entry violation: total debit (%) != total credit (%)',
      v_total_debit, v_total_credit;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'entries', v_results,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit
  );

EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Duplicate operation: this transaction has already been recorded';
END;
$$;

-- Grant execute to authenticated only
REVOKE ALL ON FUNCTION public.create_ledger_entry(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ledger_entry(text, uuid, jsonb) TO authenticated;
