
-- ══════════════════════════════════════════════════════════════
-- PHASE 1: Financial Transaction Foundation
-- ══════════════════════════════════════════════════════════════

-- 1. New enum for financial transaction types
CREATE TYPE public.fin_transaction_type AS ENUM (
  'loan_repayment',
  'loan_disbursement',
  'savings_deposit',
  'savings_withdrawal',
  'admission_fee',
  'share_capital_deposit',
  'insurance_premium',
  'insurance_claim_payout',
  'adjustment_entry'
);

-- 2. Approval status enum
CREATE TYPE public.approval_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

-- 3. Receipt number sequence
CREATE SEQUENCE IF NOT EXISTS receipt_seq START 10001 MINVALUE 10001;

-- ══════════════════════════════════════════════════════════════
-- 4. Master Table: financial_transactions
-- ══════════════════════════════════════════════════════════════
CREATE TABLE public.financial_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid REFERENCES public.clients(id),
  account_id            uuid,  -- polymorphic: loan_id or savings_id
  transaction_type      public.fin_transaction_type NOT NULL,
  amount                numeric NOT NULL CHECK (amount > 0),
  allocation_breakdown  jsonb DEFAULT '{}'::jsonb,
  reference_id          text,
  notes                 text,
  approval_status       public.approval_status NOT NULL DEFAULT 'pending',
  manual_flag           boolean NOT NULL DEFAULT false,
  receipt_number        text UNIQUE,
  receipt_snapshot      jsonb,
  created_by            uuid NOT NULL,
  approved_by           uuid,
  approved_at           timestamptz,
  rejection_reason      text,
  running_balance       jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Auto-set manual_flag for specific types
CREATE OR REPLACE FUNCTION public.set_manual_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.transaction_type IN ('adjustment_entry', 'insurance_claim_payout') THEN
    NEW.manual_flag := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_manual_flag
  BEFORE INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_manual_flag();

-- updated_at trigger
CREATE TRIGGER trg_ft_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_ft_member ON public.financial_transactions(member_id);
CREATE INDEX idx_ft_account ON public.financial_transactions(account_id);
CREATE INDEX idx_ft_type ON public.financial_transactions(transaction_type);
CREATE INDEX idx_ft_status ON public.financial_transactions(approval_status);
CREATE INDEX idx_ft_receipt ON public.financial_transactions(receipt_number);
CREATE INDEX idx_ft_created ON public.financial_transactions(created_at DESC);

-- RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access financial_transactions"
  ON public.financial_transactions FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Treasurer full access financial_transactions"
  ON public.financial_transactions FOR ALL
  USING (public.is_treasurer());

CREATE POLICY "Field officers insert financial_transactions"
  ON public.financial_transactions FOR INSERT
  WITH CHECK (public.is_field_officer() AND created_by = auth.uid());

CREATE POLICY "Field officers view own financial_transactions"
  ON public.financial_transactions FOR SELECT
  USING (public.is_field_officer() AND created_by = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- 5. SMS Logs Table
-- ══════════════════════════════════════════════════════════════
CREATE TABLE public.sms_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    uuid REFERENCES public.financial_transactions(id),
  recipient_phone   text NOT NULL,
  recipient_name    text,
  message_text      text NOT NULL,
  message_type      text NOT NULL DEFAULT 'transaction',
  status            text NOT NULL DEFAULT 'queued',
  sent_at           timestamptz,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_tx ON public.sms_logs(transaction_id);
CREATE INDEX idx_sms_status ON public.sms_logs(status);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access sms_logs"
  ON public.sms_logs FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Treasurer view sms_logs"
  ON public.sms_logs FOR SELECT
  USING (public.is_treasurer());

-- ══════════════════════════════════════════════════════════════
-- 6. Receipt Generation Function
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _yr text;
  _seq bigint;
BEGIN
  _yr := to_char(now(), 'YY');
  _seq := nextval('receipt_seq');
  RETURN 'RCP-' || _yr || '-' || _seq;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. Approve Financial Transaction RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_financial_transaction(
  _tx_id uuid,
  _approver_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _tx              RECORD;
  _receipt         text;
  _allocation      jsonb := '{}'::jsonb;
  _loan            RECORD;
  _savings         RECORD;
  _client          RECORD;
  _remaining       numeric;
  _penalty_paid    numeric := 0;
  _interest_paid   numeric := 0;
  _principal_paid  numeric := 0;
  _new_balance     jsonb;
  _sms_text        text;
  _result          jsonb;
BEGIN
  -- Lock the transaction
  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF _tx.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.approval_status;
  END IF;

  -- Manual transactions need reason
  IF _tx.manual_flag AND (_reason IS NULL OR trim(_reason) = '') THEN
    RAISE EXCEPTION 'Manual transactions require approval reason';
  END IF;

  -- Generate receipt
  _receipt := public.generate_receipt_number();

  -- Get client info
  SELECT * INTO _client FROM public.clients WHERE id = _tx.member_id;

  -- ── Apply financial effects based on type ──────────────
  CASE _tx.transaction_type

  WHEN 'loan_repayment' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (loan) required'; END IF;
    -- Use existing apply_loan_payment
    _result := public.apply_loan_payment(_tx.account_id, _tx.amount, _tx.created_by, _tx.reference_id);
    _allocation := jsonb_build_object(
      'penalty_paid', (_result->>'penalty_paid')::numeric,
      'interest_paid', (_result->>'interest_paid')::numeric,
      'principal_paid', (_result->>'principal_paid')::numeric
    );
    -- Reconcile schedule
    PERFORM public.mark_schedule_payment(_tx.account_id, _tx.amount, CURRENT_DATE);
    -- Get updated loan balance
    SELECT outstanding_principal, outstanding_interest, penalty_amount
    INTO _loan FROM public.loans WHERE id = _tx.account_id;
    _new_balance := jsonb_build_object(
      'outstanding_principal', COALESCE(_loan.outstanding_principal, 0),
      'outstanding_interest', COALESCE(_loan.outstanding_interest, 0),
      'penalty', COALESCE(_loan.penalty_amount, 0)
    );
    _sms_text := format('প্রিয় %s, আপনার ঋণ পরিশোধ ৳%s গৃহীত হয়েছে। বকেয়া: ৳%s। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en),
      _tx.amount::text,
      (COALESCE(_loan.outstanding_principal,0) + COALESCE(_loan.outstanding_interest,0))::text,
      _receipt);

  WHEN 'loan_disbursement' THEN
    -- Already handled by disburse_loan RPC; this records the financial_transaction entry
    _allocation := jsonb_build_object('disbursed', _tx.amount);
    _new_balance := jsonb_build_object('disbursed_amount', _tx.amount);
    _sms_text := format('প্রিয় %s, আপনার ঋণ ৳%s বিতরণ করা হয়েছে। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'savings_deposit' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, _tx.account_id, 'savings_deposit', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance + _tx.amount WHERE id = _tx.account_id;
    SELECT balance INTO _savings FROM public.savings_accounts WHERE id = _tx.account_id;
    _allocation := jsonb_build_object('deposited', _tx.amount);
    _new_balance := jsonb_build_object('savings_balance', COALESCE(_savings.balance, 0));
    _sms_text := format('প্রিয় %s, আপনার সঞ্চয় জমা ৳%s গৃহীত। ব্যালেন্স: ৳%s। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text,
      COALESCE(_savings.balance, 0)::text, _receipt);

  WHEN 'savings_withdrawal' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (savings) required'; END IF;
    SELECT * INTO _savings FROM public.savings_accounts WHERE id = _tx.account_id;
    IF _savings.balance < _tx.amount THEN
      RAISE EXCEPTION 'Insufficient savings balance: ৳% available, ৳% requested', _savings.balance, _tx.amount;
    END IF;
    INSERT INTO public.transactions (client_id, savings_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, _tx.account_id, 'savings_withdrawal', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id, _tx.notes);
    UPDATE public.savings_accounts SET balance = balance - _tx.amount WHERE id = _tx.account_id;
    _new_balance := jsonb_build_object('savings_balance', _savings.balance - _tx.amount);
    _allocation := jsonb_build_object('withdrawn', _tx.amount);
    _sms_text := format('প্রিয় %s, আপনার সঞ্চয় উত্তোলন ৳%s সফল। ব্যালেন্স: ৳%s। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text,
      (_savings.balance - _tx.amount)::text, _receipt);

  WHEN 'admission_fee', 'share_capital_deposit', 'insurance_premium' THEN
    -- Record in unified ledger
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id,
      _tx.transaction_type::text || ': ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', _tx.transaction_type, 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;
    _sms_text := format('প্রিয় %s, আপনার %s ৳%s গৃহীত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en),
      _tx.transaction_type::text, _tx.amount::text, _receipt);

  WHEN 'insurance_claim_payout' THEN
    _allocation := jsonb_build_object('payout', _tx.amount);
    _new_balance := '{}'::jsonb;
    _sms_text := format('প্রিয় %s, আপনার বীমা দাবি ৳%s অনুমোদিত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'adjustment_entry' THEN
    _allocation := jsonb_build_object('adjustment', _tx.amount, 'reason', _reason);
    _new_balance := '{}'::jsonb;
    _sms_text := NULL; -- No SMS for adjustments

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.transaction_type;
  END CASE;

  -- Build receipt snapshot (immutable after this point)
  _result := jsonb_build_object(
    'receipt_number', _receipt,
    'transaction_id', _tx_id,
    'member_id', _tx.member_id,
    'member_name', COALESCE(_client.name_bn, _client.name_en),
    'transaction_type', _tx.transaction_type,
    'amount', _tx.amount,
    'allocation', _allocation,
    'running_balance', _new_balance,
    'approved_by', _approver_id,
    'approved_at', now(),
    'reference_id', _tx.reference_id
  );

  -- Update the transaction atomically
  UPDATE public.financial_transactions SET
    approval_status = 'approved',
    approved_by = _approver_id,
    approved_at = now(),
    receipt_number = _receipt,
    receipt_snapshot = _result,
    allocation_breakdown = _allocation,
    running_balance = _new_balance,
    updated_at = now()
  WHERE id = _tx_id;

  -- Log SMS (if applicable)
  IF _sms_text IS NOT NULL AND _client.phone IS NOT NULL THEN
    INSERT INTO public.sms_logs (transaction_id, recipient_phone, recipient_name, message_text, message_type)
    VALUES (_tx_id, _client.phone, COALESCE(_client.name_bn, _client.name_en), _sms_text, 'transaction_approval');
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('approve_financial_transaction', 'financial_transaction', _tx_id, _approver_id, _result);

  RETURN _result;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 8. Reject Financial Transaction RPC
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_financial_transaction(
  _tx_id uuid,
  _rejector_id uuid,
  _reason text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _tx RECORD;
BEGIN
  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF _tx.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Transaction already processed (status: %)', _tx.approval_status;
  END IF;
  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE public.financial_transactions SET
    approval_status = 'rejected',
    approved_by = _rejector_id,
    approved_at = now(),
    rejection_reason = _reason,
    updated_at = now()
  WHERE id = _tx_id;

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('reject_financial_transaction', 'financial_transaction', _tx_id, _rejector_id,
    jsonb_build_object('reference_id', _tx.reference_id, 'amount', _tx.amount, 'type', _tx.transaction_type, 'reason', _reason));
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 9. Prevent editing approved transactions
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prevent_approved_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Only allow status changes on approved records (not data edits)
  IF OLD.approval_status = 'approved' AND NEW.approval_status = 'approved' THEN
    -- Block changes to financial fields
    IF OLD.amount != NEW.amount OR OLD.transaction_type != NEW.transaction_type
       OR OLD.member_id != NEW.member_id OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Cannot modify approved financial transaction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_approved_edit
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_edit();
