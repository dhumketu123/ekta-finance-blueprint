
-- 1. Add accrued_profit column to owner_exit_settlements
ALTER TABLE public.owner_exit_settlements 
ADD COLUMN IF NOT EXISTS accrued_profit numeric NOT NULL DEFAULT 0;

-- 2. Replace the RPC with updated logic
CREATE OR REPLACE FUNCTION public.process_owner_exit(
  _owner_user_id uuid,
  _total_capital numeric,
  _total_profit_earned numeric,
  _early_exit_penalty numeric DEFAULT 0,
  _loyalty_bonus numeric DEFAULT 0,
  _non_compete_months integer DEFAULT 24,
  _notes text DEFAULT NULL,
  _legal_doc_url text DEFAULT NULL,
  _accrued_profit numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 5. Calculate settlement (now includes accrued profit)
  _settlement_amount := _total_capital + _total_profit_earned + _accrued_profit;
  _final_payout := _settlement_amount - _early_exit_penalty + _loyalty_bonus;
  IF _final_payout < 0 THEN _final_payout := 0; END IF;

  -- 6. Record settlement
  INSERT INTO public.owner_exit_settlements (
    owner_id, tenant_id, tenure_days, total_capital, total_profit_earned,
    accrued_profit, early_exit_penalty, loyalty_bonus, settlement_amount, final_payout,
    non_compete_months, processed_by, notes, legal_doc_url
  ) VALUES (
    _owner_user_id, _tenant, _tenure_days, _total_capital, _total_profit_earned,
    _accrued_profit, _early_exit_penalty, _loyalty_bonus, _settlement_amount, _final_payout,
    _non_compete_months, _caller_id, _notes, _legal_doc_url
  )
  RETURNING id INTO _settlement_id;

  -- 7. Record Exit_Withdrawal in financial_transactions (capital reduction)
  INSERT INTO public.financial_transactions (
    id, transaction_type, amount, created_by, member_id,
    approval_status, notes, receipt_number
  ) VALUES (
    gen_random_uuid(),
    'expense',
    _final_payout,
    _caller_id,
    NULL,
    'approved',
    'Owner Exit Settlement — Capital Reduction for ' || (SELECT full_name FROM public.profiles WHERE id = _owner_user_id),
    'EXIT-' || _settlement_id::text
  )
  RETURNING id INTO _exit_tx_id;

  -- 8. Double-entry ledger: Debit Owner Capital, Credit Cash/Bank
  -- This ensures the global ledger perfectly balances
  INSERT INTO public.double_entry_ledger (
    tenant_id, reference_type, reference_id, account_id, account_type,
    debit, credit, balance_after, created_by, narration
  ) VALUES
  -- Debit: Owner Equity (reduce equity)
  (
    _tenant, 'owner_exit', _exit_tx_id, _owner_user_id, 'equity',
    _final_payout, 0, 0, _caller_id,
    'Owner exit capital reduction — ' || (SELECT full_name FROM public.profiles WHERE id = _owner_user_id)
  ),
  -- Credit: Cash/Bank (cash outflow)
  (
    _tenant, 'owner_exit', _exit_tx_id, _owner_user_id, 'asset',
    0, _final_payout, 0, _caller_id,
    'Owner exit payout — ' || (SELECT full_name FROM public.profiles WHERE id = _owner_user_id)
  );

  -- 9. Zero out owner's active capital in any related investor/owner records
  UPDATE public.owner_profit_shares 
  SET payment_status = 'paid' 
  WHERE owner_id = _owner_user_id AND payment_status = 'pending';

  -- 10. Transition role: owner -> alumni
  UPDATE public.user_roles SET role = 'alumni' WHERE user_id = _owner_user_id AND role = 'owner';
  UPDATE public.profiles SET role = 'alumni' WHERE id = _owner_user_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Owner exit processed successfully. Capital zeroed and ledger balanced.',
    'settlement_id', _settlement_id,
    'final_payout', _final_payout,
    'tenure_days', _tenure_days,
    'exit_transaction_id', _exit_tx_id
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Cannot process exit: active financial references exist. Please settle all outstanding transactions first.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Exit processing failed: ' || SQLERRM);
END;
$$;
