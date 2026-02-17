
-- 1. Create pending_transactions table
CREATE TABLE public.pending_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.transaction_type NOT NULL,
  reference_id TEXT NOT NULL UNIQUE,
  submitted_by UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  loan_id UUID REFERENCES public.loans(id),
  savings_id UUID REFERENCES public.savings_accounts(id),
  client_id UUID REFERENCES public.clients(id),
  notes TEXT,
  reviewed_by UUID,
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.pending_transactions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Admin/owner full access pending_transactions"
ON public.pending_transactions FOR ALL
USING (public.is_admin_or_owner());

CREATE POLICY "Field officers can insert pending_transactions"
ON public.pending_transactions FOR INSERT
WITH CHECK (public.is_field_officer() AND submitted_by = auth.uid());

CREATE POLICY "Field officers view own pending_transactions"
ON public.pending_transactions FOR SELECT
USING (public.is_field_officer() AND submitted_by = auth.uid());

-- 4. updated_at trigger (reuse existing function)
CREATE TRIGGER update_pending_transactions_updated_at
BEFORE UPDATE ON public.pending_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_transactions;

-- 6. Approve function — uses existing apply_loan_payment for loan types
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
  _tx RECORD;
  _result JSONB;
BEGIN
  SELECT * INTO _tx FROM public.pending_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending transaction not found'; END IF;
  IF _tx.status != 'pending' THEN RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.status; END IF;

  -- Apply based on type
  IF _tx.type IN ('loan_principal', 'loan_interest', 'loan_penalty', 'loan_repayment') THEN
    -- Use existing apply_loan_payment
    IF _tx.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan payment'; END IF;
    _result := public.apply_loan_payment(_tx.loan_id, _tx.amount, _tx.submitted_by, _tx.reference_id);
  ELSIF _tx.type = 'savings_deposit' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings deposit'; END IF;
    -- Insert savings transaction
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_deposit', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    -- Update balance
    UPDATE public.savings_accounts SET balance = balance + _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type', 'savings_deposit', 'amount', _tx.amount, 'savings_id', _tx.savings_id);
  ELSIF _tx.type = 'savings_withdrawal' THEN
    IF _tx.savings_id IS NULL THEN RAISE EXCEPTION 'savings_id required for savings withdrawal'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.client_id, _tx.savings_id, 'savings_withdrawal', _tx.amount, CURRENT_DATE, 'paid', _tx.submitted_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance - _tx.amount WHERE id = _tx.savings_id;
    _result := jsonb_build_object('type', 'savings_withdrawal', 'amount', _tx.amount, 'savings_id', _tx.savings_id);
  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.type;
  END IF;

  -- Mark approved
  UPDATE public.pending_transactions 
  SET status = 'approved', reviewed_by = _reviewer_id, review_reason = _reason, reviewed_at = now()
  WHERE id = _tx_id;

  -- Audit
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('approve_transaction', 'pending_transaction', _tx_id, _reviewer_id, 
    jsonb_build_object('reference_id', _tx.reference_id, 'amount', _tx.amount, 'type', _tx.type, 'result', _result, 'reason', _reason));

  RETURN _result;
END;
$$;

-- 7. Reject function
CREATE OR REPLACE FUNCTION public.reject_pending_transaction(
  _tx_id UUID,
  _reviewer_id UUID,
  _reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tx RECORD;
BEGIN
  SELECT * INTO _tx FROM public.pending_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending transaction not found'; END IF;
  IF _tx.status != 'pending' THEN RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.status; END IF;

  UPDATE public.pending_transactions 
  SET status = 'rejected', reviewed_by = _reviewer_id, review_reason = _reason, reviewed_at = now()
  WHERE id = _tx_id;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('reject_transaction', 'pending_transaction', _tx_id, _reviewer_id, 
    jsonb_build_object('reference_id', _tx.reference_id, 'amount', _tx.amount, 'type', _tx.type, 'reason', _reason));
END;
$$;
