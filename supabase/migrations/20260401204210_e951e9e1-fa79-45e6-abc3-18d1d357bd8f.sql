
-- 1. Add share_percentage to investors
ALTER TABLE public.investors
ADD COLUMN IF NOT EXISTS share_percentage numeric NOT NULL DEFAULT 0;

-- 2. Add internal_treasury to tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS internal_treasury numeric NOT NULL DEFAULT 0;

-- 3. Update process_owner_exit to route equity to treasury
CREATE OR REPLACE FUNCTION public.process_owner_exit(
  _owner_user_id uuid,
  _total_capital numeric,
  _total_profit_earned numeric DEFAULT 0,
  _early_exit_penalty numeric DEFAULT 0,
  _loyalty_bonus numeric DEFAULT 0,
  _non_compete_months integer DEFAULT 24,
  _notes text DEFAULT '',
  _legal_doc_url text DEFAULT '',
  _accrued_profit numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
  _caller_id uuid;
  _tenant uuid;
  _settlement_amount numeric;
  _final_payout numeric;
  _tenure_days integer;
  _profile_created_at timestamptz;
  _settlement_id uuid;
  _exiting_share numeric;
  _exit_tx_id uuid;
BEGIN
  -- 1. Verify caller is admin or super_admin
  _caller_role := get_user_role();
  _caller_id := auth.uid();
  
  IF _caller_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Access denied: admin or super_admin role required');
  END IF;

  -- 2. Verify target is an active owner
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _owner_user_id AND role = 'owner') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Target user does not have owner role');
  END IF;

  -- 3. Get tenure
  SELECT created_at INTO _profile_created_at FROM public.profiles WHERE id = _owner_user_id;
  IF _profile_created_at IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Owner profile not found');
  END IF;
  
  _tenure_days := EXTRACT(DAY FROM (now() - _profile_created_at))::integer;

  -- 4. Get tenant
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _owner_user_id;

  -- 5. Calculate settlement
  _settlement_amount := _total_capital + _total_profit_earned + _accrued_profit;
  _final_payout := _settlement_amount - _early_exit_penalty + _loyalty_bonus;
  IF _final_payout < 0 THEN _final_payout := 0; END IF;

  -- 6. Get exiting owner's share_percentage from their investor record
  SELECT COALESCE(i.share_percentage, 0) INTO _exiting_share
  FROM public.investors i
  WHERE i.user_id = _owner_user_id AND i.deleted_at IS NULL
  LIMIT 1;

  -- 7. Route equity to internal treasury
  UPDATE public.tenants
  SET internal_treasury = COALESCE(internal_treasury, 0) + _exiting_share
  WHERE id = _tenant;

  -- 8. Zero out exiting owner's share on investor record
  UPDATE public.investors
  SET share_percentage = 0, status = 'inactive', capital = 0
  WHERE user_id = _owner_user_id AND deleted_at IS NULL;

  -- 9. Record exit settlement
  INSERT INTO public.owner_exit_settlements (
    owner_id, tenant_id, tenure_days, total_capital, total_profit_earned,
    early_exit_penalty, loyalty_bonus, settlement_amount, final_payout,
    non_compete_months, processed_by, notes, legal_doc_url, accrued_profit
  ) VALUES (
    _owner_user_id, _tenant, _tenure_days, _total_capital, _total_profit_earned,
    _early_exit_penalty, _loyalty_bonus, _settlement_amount, _final_payout,
    _non_compete_months, _caller_id, _notes, _legal_doc_url, _accrued_profit
  )
  RETURNING id INTO _settlement_id;

  -- 10. Record exit withdrawal in financial_transactions
  _exit_tx_id := gen_random_uuid();
  INSERT INTO public.financial_transactions (
    id, transaction_type, amount, created_by, member_id,
    approval_status, notes, receipt_number
  ) VALUES (
    _exit_tx_id, 'capital_withdrawal', _final_payout, _caller_id, NULL,
    'approved', 'Owner Exit Settlement — ' || _owner_user_id::text, 'EXIT-' || LEFT(_settlement_id::text, 8)
  );

  -- 11. Double-entry ledger: Debit Owner Equity / Credit Cash
  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_id, account_type,
    debit, credit, balance_after, narration, created_by
  ) VALUES
  (
    _tenant, 'owner_exit', _exit_tx_id, _owner_user_id, 'equity',
    _final_payout, 0, 0,
    'Owner exit — equity reduction', _caller_id
  ),
  (
    _tenant, 'owner_exit', _exit_tx_id, _owner_user_id, 'asset',
    0, _final_payout, 0,
    'Owner exit — cash outflow', _caller_id
  );

  -- 12. Transition role: owner -> alumni
  UPDATE public.user_roles SET role = 'alumni' WHERE user_id = _owner_user_id AND role = 'owner';
  UPDATE public.profiles SET role = 'alumni' WHERE id = _owner_user_id;

  -- 13. Audit log
  INSERT INTO public.audit_logs (entity_type, entity_id, action_type, user_id, details)
  VALUES ('owner_exit', _owner_user_id, 'exit_processed', _caller_id,
    jsonb_build_object(
      'final_payout', _final_payout,
      'equity_to_treasury', _exiting_share,
      'tenure_days', _tenure_days,
      'settlement_id', _settlement_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Owner exit processed successfully',
    'settlement_id', _settlement_id,
    'final_payout', _final_payout,
    'tenure_days', _tenure_days,
    'equity_to_treasury', _exiting_share
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Cannot process exit: active financial references exist.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Exit processing failed: ' || SQLERRM);
END;
$$;

-- 4. Create admin_redistribute_treasury RPC
CREATE OR REPLACE FUNCTION public.admin_redistribute_treasury(
  _method text -- 'equal' or 'pro_rata'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
  _caller_id uuid;
  _tenant uuid;
  _treasury numeric;
  _active_count integer;
  _total_active_capital numeric;
  _per_owner_share numeric;
  _inv record;
  _distributed numeric := 0;
  _last_inv_id uuid;
BEGIN
  -- 1. Verify super_admin only
  _caller_role := get_user_role();
  _caller_id := auth.uid();
  
  IF _caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Access denied: super_admin role required');
  END IF;

  -- 2. Get tenant
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _caller_id;
  IF _tenant IS NULL THEN
    -- super_admin may not have tenant — find the tenant with treasury > 0
    SELECT id, internal_treasury INTO _tenant, _treasury
    FROM public.tenants
    WHERE internal_treasury > 0
    LIMIT 1;
  ELSE
    SELECT internal_treasury INTO _treasury FROM public.tenants WHERE id = _tenant;
  END IF;

  IF _treasury IS NULL OR _treasury <= 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No equity in treasury to distribute');
  END IF;

  -- 3. Validate method
  IF _method NOT IN ('equal', 'pro_rata') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Invalid method. Use equal or pro_rata');
  END IF;

  -- 4. Count active owners (non-deleted investors with share_percentage > 0 or capital > 0)
  SELECT COUNT(*), COALESCE(SUM(capital), 0)
  INTO _active_count, _total_active_capital
  FROM public.investors
  WHERE tenant_id = _tenant AND status = 'active' AND deleted_at IS NULL;

  IF _active_count = 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No active owners found for redistribution');
  END IF;

  -- 5. Distribute based on method
  IF _method = 'equal' THEN
    _per_owner_share := ROUND(_treasury / _active_count, 2);
    
    FOR _inv IN
      SELECT id FROM public.investors
      WHERE tenant_id = _tenant AND status = 'active' AND deleted_at IS NULL
      ORDER BY created_at ASC
    LOOP
      _last_inv_id := _inv.id;
      UPDATE public.investors
      SET share_percentage = share_percentage + _per_owner_share
      WHERE id = _inv.id;
      _distributed := _distributed + _per_owner_share;
    END LOOP;

    -- Handle rounding remainder — assign to last owner
    IF _distributed != _treasury THEN
      UPDATE public.investors
      SET share_percentage = share_percentage + (_treasury - _distributed)
      WHERE id = _last_inv_id;
    END IF;

  ELSIF _method = 'pro_rata' THEN
    IF _total_active_capital <= 0 THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Cannot use pro_rata: all active owners have zero capital');
    END IF;

    FOR _inv IN
      SELECT id, capital FROM public.investors
      WHERE tenant_id = _tenant AND status = 'active' AND deleted_at IS NULL
      ORDER BY created_at ASC
    LOOP
      _last_inv_id := _inv.id;
      _per_owner_share := ROUND((_inv.capital / _total_active_capital) * _treasury, 2);
      UPDATE public.investors
      SET share_percentage = share_percentage + _per_owner_share
      WHERE id = _inv.id;
      _distributed := _distributed + _per_owner_share;
    END LOOP;

    -- Handle rounding remainder
    IF _distributed != _treasury THEN
      UPDATE public.investors
      SET share_percentage = share_percentage + (_treasury - _distributed)
      WHERE id = _last_inv_id;
    END IF;
  END IF;

  -- 6. Empty treasury
  UPDATE public.tenants SET internal_treasury = 0 WHERE id = _tenant;

  -- 7. Audit log
  INSERT INTO public.audit_logs (entity_type, entity_id, action_type, user_id, details)
  VALUES ('treasury_redistribution', _tenant, 'redistribute', _caller_id,
    jsonb_build_object(
      'method', _method,
      'treasury_amount', _treasury,
      'active_owners', _active_count,
      'distributed', _treasury
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Treasury redistributed successfully',
    'method', _method,
    'amount_distributed', _treasury,
    'owners_affected', _active_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Redistribution failed: ' || SQLERRM);
END;
$$;
