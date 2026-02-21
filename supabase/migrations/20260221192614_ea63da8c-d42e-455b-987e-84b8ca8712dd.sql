
-- Add metadata JSONB column to pending_transactions for disbursement details
ALTER TABLE public.pending_transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update approve_pending_transaction to handle loan_disbursement
CREATE OR REPLACE FUNCTION public.approve_pending_transaction(
  _tx_id UUID,
  _reviewer_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tx     RECORD;
  _result JSONB;
  _meta   JSONB;
BEGIN
  SELECT * INTO _tx FROM public.pending_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending transaction not found'; END IF;
  IF _tx.status != 'pending' THEN
    RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.status;
  END IF;

  -- Prevent self-approval (Maker cannot be Checker)
  IF _tx.submitted_by = _reviewer_id THEN
    RAISE EXCEPTION 'Cannot approve your own submission (Maker-Checker violation)';
  END IF;

  -- Apply based on type
  IF _tx.type IN ('loan_principal','loan_interest','loan_penalty','loan_repayment') THEN
    IF _tx.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan payment'; END IF;
    _result := public.apply_loan_payment(_tx.loan_id, _tx.amount, _tx.submitted_by, _tx.reference_id);
    PERFORM public.mark_schedule_payment(_tx.loan_id, _tx.amount, CURRENT_DATE);

  ELSIF _tx.type = 'loan_disbursement' THEN
    _meta := COALESCE(_tx.metadata, '{}'::jsonb);
    IF _meta->>'loan_product_id' IS NULL OR _meta->>'principal_amount' IS NULL THEN
      RAISE EXCEPTION 'metadata must contain loan_product_id and principal_amount for disbursement';
    END IF;
    _result := public.disburse_loan(
      _client_id         := _tx.client_id,
      _loan_product_id   := (_meta->>'loan_product_id')::UUID,
      _principal_amount  := (_meta->>'principal_amount')::NUMERIC,
      _disbursement_date := COALESCE(_meta->>'disbursement_date', CURRENT_DATE::TEXT),
      _assigned_officer  := _tx.submitted_by,
      _notes             := COALESCE(_tx.notes, ''),
      _loan_model        := COALESCE(_meta->>'loan_model', 'flat')
    );

  ELSIF _tx.type = 'savings_deposit' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings deposit'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_deposit', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance + _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type','savings_deposit','amount',_tx.amount,'savings_id',_tx.savings_id);

  ELSIF _tx.type = 'savings_withdrawal' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings withdrawal'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_withdrawal', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance - _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type','savings_withdrawal','amount',_tx.amount,'savings_id',_tx.savings_id);

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.type;
  END IF;

  -- Mark approved
  UPDATE public.pending_transactions
  SET status='approved', reviewed_by=_reviewer_id, review_reason=_reason, reviewed_at=now()
  WHERE id = _tx_id;

  -- Audit
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('approve_transaction','pending_transaction', _tx_id, _reviewer_id,
    jsonb_build_object('reference_id',_tx.reference_id,'amount',_tx.amount,'type',_tx.type,'result',_result,'reason',_reason));

  RETURN _result;
END;
$$;
