
-- ═══════════════════════════════════════════════════════════════
-- PHASE 1 HARDENING + PHASE 2: MASTER LEDGER (DOUBLE-ENTRY BASE)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Account Code Enum ─────────────────────────────────────
CREATE TYPE public.account_code AS ENUM (
  'CASH_ON_HAND',
  'LOAN_PRINCIPAL',
  'LOAN_INTEREST',
  'PENALTY_INCOME',
  'SAVINGS_LIABILITY',
  'SHARE_CAPITAL',
  'INSURANCE_PAYABLE',
  'ADMISSION_FEE_INCOME',
  'INSURANCE_PREMIUM_INCOME',
  'ADJUSTMENT_ACCOUNT',
  'DISBURSEMENT_OUTFLOW'
);

-- ── 2. Master Ledger Table ───────────────────────────────────
CREATE TABLE public.master_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  account_code public.account_code NOT NULL,
  debit_amount numeric NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount numeric NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  member_id uuid REFERENCES public.clients(id),
  narration text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Constraint: each row must be either debit or credit, not both zero
ALTER TABLE public.master_ledger
  ADD CONSTRAINT ledger_entry_nonzero CHECK (debit_amount > 0 OR credit_amount > 0);

-- Constraint: each row must be either debit OR credit, not both
ALTER TABLE public.master_ledger
  ADD CONSTRAINT ledger_entry_one_side CHECK (NOT (debit_amount > 0 AND credit_amount > 0));

-- Indexes
CREATE INDEX idx_master_ledger_tx ON public.master_ledger(transaction_id);
CREATE INDEX idx_master_ledger_account ON public.master_ledger(account_code);
CREATE INDEX idx_master_ledger_member ON public.master_ledger(member_id);
CREATE INDEX idx_master_ledger_created ON public.master_ledger(created_at);

-- ── 3. RLS on master_ledger ──────────────────────────────────
ALTER TABLE public.master_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access master_ledger"
  ON public.master_ledger FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Treasurer view master_ledger"
  ON public.master_ledger FOR SELECT
  USING (public.is_treasurer());

-- ── 4. Immutability trigger on master_ledger ─────────────────
CREATE OR REPLACE FUNCTION public.prevent_ledger_modification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable — cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable — cannot be deleted';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_ledger_edit
  BEFORE UPDATE OR DELETE ON public.master_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ledger_modification();

-- ── 5. Ledger validation function ────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_ledger_balance(_tx_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _total_debit numeric;
  _total_credit numeric;
BEGIN
  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO _total_debit, _total_credit
  FROM public.master_ledger
  WHERE transaction_id = _tx_id;

  IF _total_debit != _total_credit THEN
    RAISE EXCEPTION 'Ledger imbalance for tx %: debit=% credit=%', _tx_id, _total_debit, _total_credit;
  END IF;

  IF _total_debit = 0 THEN
    RAISE EXCEPTION 'No ledger entries found for tx %', _tx_id;
  END IF;

  RETURN true;
END;
$$;

-- ── 6. Updated approve_financial_transaction with double-entry ──
CREATE OR REPLACE FUNCTION public.approve_financial_transaction(
  _tx_id uuid, _approver_id uuid, _reason text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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
  -- ═══ PHASE 1 HARDENING: Lock + validate ═══════════════════
  SELECT * INTO _tx FROM public.financial_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  -- Double-approval prevention (strict)
  IF _tx.approval_status = 'approved' THEN
    RAISE EXCEPTION 'Transaction already approved (receipt: %)', _tx.receipt_number;
  END IF;
  IF _tx.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'Transaction already rejected — cannot approve';
  END IF;
  IF _tx.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Transaction status invalid: %', _tx.approval_status;
  END IF;

  -- Self-approval prevention
  IF _tx.created_by = _approver_id THEN
    RAISE EXCEPTION 'Maker cannot approve their own transaction (maker-checker violation)';
  END IF;

  -- Manual transactions need reason
  IF _tx.manual_flag AND (_reason IS NULL OR trim(_reason) = '') THEN
    RAISE EXCEPTION 'Manual transactions require approval reason';
  END IF;

  -- Generate receipt
  _receipt := public.generate_receipt_number();

  -- Get client info
  SELECT * INTO _client FROM public.clients WHERE id = _tx.member_id;

  -- ═══ Apply financial effects based on type ════════════════
  CASE _tx.transaction_type

  WHEN 'loan_repayment' THEN
    IF _tx.account_id IS NULL THEN RAISE EXCEPTION 'account_id (loan) required'; END IF;
    _result := public.apply_loan_payment(_tx.account_id, _tx.amount, _tx.created_by, _tx.reference_id);
    _penalty_paid := COALESCE((_result->>'penalty_paid')::numeric, 0);
    _interest_paid := COALESCE((_result->>'interest_paid')::numeric, 0);
    _principal_paid := COALESCE((_result->>'principal_paid')::numeric, 0);
    _allocation := jsonb_build_object(
      'penalty_paid', _penalty_paid,
      'interest_paid', _interest_paid,
      'principal_paid', _principal_paid
    );
    PERFORM public.mark_schedule_payment(_tx.account_id, _tx.amount, CURRENT_DATE);
    SELECT outstanding_principal, outstanding_interest, penalty_amount
    INTO _loan FROM public.loans WHERE id = _tx.account_id;
    _new_balance := jsonb_build_object(
      'outstanding_principal', COALESCE(_loan.outstanding_principal, 0),
      'outstanding_interest', COALESCE(_loan.outstanding_interest, 0),
      'penalty', COALESCE(_loan.penalty_amount, 0)
    );

    -- ── LEDGER: Loan Repayment ──
    -- Dr CASH_ON_HAND (total amount received)
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', _tx.amount, 0, _tx.member_id, 'Cash received for loan repayment');

    -- Cr PENALTY_INCOME
    IF _penalty_paid > 0 THEN
      INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
      VALUES (_tx_id, 'PENALTY_INCOME', 0, _penalty_paid, _tx.member_id, 'Penalty income');
    END IF;
    -- Cr LOAN_INTEREST
    IF _interest_paid > 0 THEN
      INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
      VALUES (_tx_id, 'LOAN_INTEREST', 0, _interest_paid, _tx.member_id, 'Interest income');
    END IF;
    -- Cr LOAN_PRINCIPAL
    IF _principal_paid > 0 THEN
      INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
      VALUES (_tx_id, 'LOAN_PRINCIPAL', 0, _principal_paid, _tx.member_id, 'Principal recovered');
    END IF;

    _sms_text := format('প্রিয় %s, আপনার ঋণ পরিশোধ ৳%s গৃহীত হয়েছে। বকেয়া: ৳%s। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text,
      (COALESCE(_loan.outstanding_principal,0) + COALESCE(_loan.outstanding_interest,0))::text, _receipt);

  WHEN 'loan_disbursement' THEN
    _allocation := jsonb_build_object('disbursed', _tx.amount);
    _new_balance := jsonb_build_object('disbursed_amount', _tx.amount);

    -- ── LEDGER: Loan Disbursement ──
    -- Dr LOAN_PRINCIPAL (asset: money lent out)
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'LOAN_PRINCIPAL', _tx.amount, 0, _tx.member_id, 'Loan principal disbursed');
    -- Cr CASH_ON_HAND (cash goes out)
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', 0, _tx.amount, _tx.member_id, 'Cash disbursed for loan');

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

    -- ── LEDGER: Savings Deposit ──
    -- Dr CASH_ON_HAND
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', _tx.amount, 0, _tx.member_id, 'Cash received for savings');
    -- Cr SAVINGS_LIABILITY
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'SAVINGS_LIABILITY', 0, _tx.amount, _tx.member_id, 'Savings liability increased');

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

    -- ── LEDGER: Savings Withdrawal ──
    -- Dr SAVINGS_LIABILITY (liability decreases)
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'SAVINGS_LIABILITY', _tx.amount, 0, _tx.member_id, 'Savings liability decreased');
    -- Cr CASH_ON_HAND (cash goes out)
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', 0, _tx.amount, _tx.member_id, 'Cash paid for savings withdrawal');

    _sms_text := format('প্রিয় %s, আপনার সঞ্চয় উত্তোলন ৳%s সফল। ব্যালেন্স: ৳%s। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text,
      (_savings.balance - _tx.amount)::text, _receipt);

  WHEN 'admission_fee' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id,
      'admission_fee: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'admission_fee', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;

    -- ── LEDGER: Admission Fee ──
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', _tx.amount, 0, _tx.member_id, 'Cash received for admission fee');
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'ADMISSION_FEE_INCOME', 0, _tx.amount, _tx.member_id, 'Admission fee income');

    _sms_text := format('প্রিয় %s, আপনার ভর্তি ফি ৳%s গৃহীত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'share_capital_deposit' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id,
      'share_capital_deposit: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'share_capital_deposit', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;

    -- ── LEDGER: Share Capital ──
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', _tx.amount, 0, _tx.member_id, 'Cash received for share capital');
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'SHARE_CAPITAL', 0, _tx.amount, _tx.member_id, 'Share capital liability');

    _sms_text := format('প্রিয় %s, আপনার শেয়ার মূলধন ৳%s গৃহীত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'insurance_premium' THEN
    INSERT INTO public.transactions (client_id, type, amount, transaction_date, status, performed_by, reference_id, notes)
    VALUES (_tx.member_id, 'loan_repayment', _tx.amount, CURRENT_DATE, 'paid', _tx.created_by, _tx.reference_id,
      'insurance_premium: ' || COALESCE(_tx.notes, ''));
    _allocation := jsonb_build_object('fee_type', 'insurance_premium', 'amount', _tx.amount);
    _new_balance := '{}'::jsonb;

    -- ── LEDGER: Insurance Premium ──
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', _tx.amount, 0, _tx.member_id, 'Cash received for insurance premium');
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'INSURANCE_PREMIUM_INCOME', 0, _tx.amount, _tx.member_id, 'Insurance premium income');

    _sms_text := format('প্রিয় %s, আপনার বীমা প্রিমিয়াম ৳%s গৃহীত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'insurance_claim_payout' THEN
    _allocation := jsonb_build_object('payout', _tx.amount);
    _new_balance := '{}'::jsonb;

    -- ── LEDGER: Insurance Claim Payout ──
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'INSURANCE_PAYABLE', _tx.amount, 0, _tx.member_id, 'Insurance claim paid out');
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', 0, _tx.amount, _tx.member_id, 'Cash paid for insurance claim');

    _sms_text := format('প্রিয় %s, আপনার বীমা দাবি ৳%s অনুমোদিত। রিসিপ্ট: %s',
      COALESCE(_client.name_bn, _client.name_en), _tx.amount::text, _receipt);

  WHEN 'adjustment_entry' THEN
    _allocation := jsonb_build_object('adjustment', _tx.amount, 'reason', _reason);
    _new_balance := '{}'::jsonb;

    -- ── LEDGER: Adjustment ──
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'ADJUSTMENT_ACCOUNT', _tx.amount, 0, _tx.member_id, 'Adjustment: ' || COALESCE(_reason, ''));
    INSERT INTO public.master_ledger (transaction_id, account_code, debit_amount, credit_amount, member_id, narration)
    VALUES (_tx_id, 'CASH_ON_HAND', 0, _tx.amount, _tx.member_id, 'Adjustment counter-entry');

    _sms_text := NULL;

  ELSE
    RAISE EXCEPTION 'Unsupported transaction type: %', _tx.transaction_type;
  END CASE;

  -- ═══ VALIDATE LEDGER BALANCE (strict double-entry) ════════
  PERFORM public.validate_ledger_balance(_tx_id);

  -- Build receipt snapshot
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
