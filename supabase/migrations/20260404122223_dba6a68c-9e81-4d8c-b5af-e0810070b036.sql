-- 1. Add DPS and Fixed to savings_product_type enum
ALTER TYPE public.savings_product_type ADD VALUE IF NOT EXISTS 'dps';
ALTER TYPE public.savings_product_type ADD VALUE IF NOT EXISTS 'fixed';

-- 2. Add maturity & tracking columns to savings_accounts
ALTER TABLE public.savings_accounts
  ADD COLUMN IF NOT EXISTS maturity_date date,
  ADD COLUMN IF NOT EXISTS tenure_months integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_deposited numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_earned numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_profit_date date;

-- 3. Create savings transaction RPC (bank-grade)
CREATE OR REPLACE FUNCTION public.process_savings_transaction(
  _savings_account_id uuid,
  _amount numeric,
  _transaction_type text, -- 'savings_deposit' or 'savings_withdrawal'
  _performed_by uuid,
  _reference_id text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _account record;
  _product record;
  _new_balance numeric;
  _receipt_num text;
  _ft_id uuid;
  _result jsonb;
  _days_since_open integer;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  -- Validate transaction type
  IF _transaction_type NOT IN ('savings_deposit', 'savings_withdrawal') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', _transaction_type;
  END IF;

  -- Lock the account row
  SELECT * INTO _account FROM public.savings_accounts
  WHERE id = _savings_account_id AND status = 'active' AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'সক্রিয় সঞ্চয় অ্যাকাউন্ট পাওয়া যায়নি (Active savings account not found)';
  END IF;

  -- Get product rules
  SELECT * INTO _product FROM public.savings_products
  WHERE id = _account.savings_product_id AND deleted_at IS NULL;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'পরিমাণ ০ এর বেশি হতে হবে (Amount must be positive)';
  END IF;

  -- Duplicate reference check
  IF _reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE reference_id = _reference_id) THEN
      RAISE EXCEPTION 'ডুপ্লিকেট রেফারেন্স: এই রেফারেন্স নম্বরে ইতোমধ্যে একটি লেনদেন বিদ্যমান।';
    END IF;
  END IF;

  -- Generate receipt number
  _receipt_num := 'SAV-' || to_char(now(), 'YYYYMMDD-HH24MISS-MS') || '-' || substr(gen_random_uuid()::text, 1, 4);

  IF _transaction_type = 'savings_deposit' THEN
    -- Min amount check
    IF _product IS NOT NULL AND _product.min_amount > 0 AND _amount < _product.min_amount THEN
      RAISE EXCEPTION 'সর্বনিম্ন জমার পরিমাণ ৳% (Minimum deposit is ৳%)', _product.min_amount, _product.min_amount;
    END IF;

    _new_balance := _account.balance + _amount;

    -- Update balance and total_deposited
    UPDATE public.savings_accounts
    SET balance = _new_balance,
        total_deposited = total_deposited + _amount,
        updated_at = now()
    WHERE id = _savings_account_id;

  ELSIF _transaction_type = 'savings_withdrawal' THEN
    -- Overdraft check
    IF _amount > _account.balance THEN
      RAISE EXCEPTION 'অপর্যাপ্ত ব্যালেন্স: বর্তমান ৳%, অনুরোধকৃত ৳% (Insufficient balance)', _account.balance, _amount;
    END IF;

    -- Minimum balance enforcement
    IF _product IS NOT NULL AND _product.minimum_balance > 0 THEN
      IF (_account.balance - _amount) < _product.minimum_balance THEN
        RAISE EXCEPTION 'সর্বনিম্ন ব্যালেন্স ৳% বজায় রাখতে হবে। সর্বোচ্চ ৳% উত্তোলন সম্ভব। (Must maintain minimum balance ৳%)',
          _product.minimum_balance, (_account.balance - _product.minimum_balance), _product.minimum_balance;
      END IF;
    END IF;

    -- Lock period enforcement
    IF _product IS NOT NULL AND _product.lock_period_days > 0 THEN
      _days_since_open := CURRENT_DATE - _account.opened_date;
      IF _days_since_open < _product.lock_period_days THEN
        RAISE EXCEPTION 'লক পিরিয়ড চলমান: অ্যাকাউন্ট খোলার পর %দিন লক থাকবে। আরো %দিন বাকি। (Lock period: % days remaining)',
          _product.lock_period_days, (_product.lock_period_days - _days_since_open), (_product.lock_period_days - _days_since_open);
      END IF;
    END IF;

    _new_balance := _account.balance - _amount;

    UPDATE public.savings_accounts
    SET balance = _new_balance,
        updated_at = now()
    WHERE id = _savings_account_id;
  END IF;

  -- Insert into financial_transactions for proper audit trail
  INSERT INTO public.financial_transactions (
    member_id, account_id, transaction_type, amount,
    created_by, approval_status, reference_id, notes, receipt_number
  ) VALUES (
    _account.client_id, _savings_account_id,
    _transaction_type::fin_transaction_type, _amount,
    _performed_by, 'approved', _reference_id, _notes, _receipt_num
  ) RETURNING id INTO _ft_id;

  -- Build result
  _result := jsonb_build_object(
    'success', true,
    'savings_account_id', _savings_account_id,
    'transaction_type', _transaction_type,
    'amount', _amount,
    'new_balance', _new_balance,
    'previous_balance', _account.balance,
    'receipt_number', _receipt_num,
    'ft_id', _ft_id,
    'client_id', _account.client_id
  );

  RETURN _result;
END;
$$;