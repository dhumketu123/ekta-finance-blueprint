
-- =============================================
-- PHASE 3 STEP 0: FINANCIAL CORE STRUCTURE FREEZE
-- =============================================

-- 1. New ENUMs
CREATE TYPE public.loan_model AS ENUM ('flat', 'reducing');
CREATE TYPE public.loan_status AS ENUM ('active', 'closed', 'default');
CREATE TYPE public.savings_product_type AS ENUM ('general', 'locked');
CREATE TYPE public.investment_model AS ENUM ('profit_only', 'profit_plus_principal');
CREATE TYPE public.investor_status AS ENUM ('active', 'matured', 'closed');

-- 2. Add missing transaction types to existing enum
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'loan_principal';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'loan_interest';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'loan_penalty';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'investor_principal_return';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'owner_profit_share';

-- 3. CREATE loans TABLE
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  loan_product_id UUID REFERENCES public.loan_products(id),
  total_principal NUMERIC NOT NULL DEFAULT 0,
  total_interest NUMERIC NOT NULL DEFAULT 0,
  outstanding_principal NUMERIC NOT NULL DEFAULT 0,
  outstanding_interest NUMERIC NOT NULL DEFAULT 0,
  penalty_amount NUMERIC NOT NULL DEFAULT 0,
  emi_amount NUMERIC NOT NULL DEFAULT 0,
  loan_model public.loan_model NOT NULL DEFAULT 'flat',
  status public.loan_status NOT NULL DEFAULT 'active',
  disbursement_date DATE,
  maturity_date DATE,
  assigned_officer UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access loans" ON public.loans FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Field officers view assigned loans" ON public.loans FOR SELECT
  USING (is_field_officer() AND is_assigned_to_client(client_id) AND deleted_at IS NULL);

CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.loans;

-- 4. CREATE savings_accounts TABLE
CREATE TABLE public.savings_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  savings_product_id UUID REFERENCES public.savings_products(id),
  balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access savings_accounts" ON public.savings_accounts FOR ALL USING (is_admin_or_owner());
CREATE POLICY "Field officers view assigned savings" ON public.savings_accounts FOR SELECT
  USING (is_field_officer() AND is_assigned_to_client(client_id) AND deleted_at IS NULL);

CREATE TRIGGER update_savings_accounts_updated_at BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_accounts;

-- 5. ADD loan_id & savings_id to transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES public.loans(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS savings_id UUID REFERENCES public.savings_accounts(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS performed_by UUID;

-- 6. ENHANCE savings_products
ALTER TABLE public.savings_products ADD COLUMN IF NOT EXISTS product_type public.savings_product_type NOT NULL DEFAULT 'general';
ALTER TABLE public.savings_products ADD COLUMN IF NOT EXISTS minimum_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.savings_products ADD COLUMN IF NOT EXISTS lock_period_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.savings_products ADD COLUMN IF NOT EXISTS profit_rate NUMERIC NOT NULL DEFAULT 0;

-- 7. ENHANCE investors
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS investment_model public.investment_model NOT NULL DEFAULT 'profit_only';
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS principal_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS accumulated_profit NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS maturity_date DATE;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS status public.investor_status NOT NULL DEFAULT 'active';

-- 8. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON public.loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_client_id ON public.savings_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_loan_id ON public.transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_transactions_savings_id ON public.transactions(savings_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);

-- 9. PAYMENT PRIORITY FUNCTION (Penalty → Interest → Principal)
CREATE OR REPLACE FUNCTION public.apply_loan_payment(_loan_id UUID, _amount NUMERIC, _performed_by UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loan RECORD;
  _remaining NUMERIC := _amount;
  _penalty_paid NUMERIC := 0;
  _interest_paid NUMERIC := 0;
  _principal_paid NUMERIC := 0;
  _result JSONB;
BEGIN
  SELECT * INTO _loan FROM public.loans WHERE id = _loan_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  -- 1. Pay penalty first
  IF _remaining > 0 AND _loan.penalty_amount > 0 THEN
    _penalty_paid := LEAST(_remaining, _loan.penalty_amount);
    _remaining := _remaining - _penalty_paid;
  END IF;

  -- 2. Pay interest
  IF _remaining > 0 AND _loan.outstanding_interest > 0 THEN
    _interest_paid := LEAST(_remaining, _loan.outstanding_interest);
    _remaining := _remaining - _interest_paid;
  END IF;

  -- 3. Pay principal
  IF _remaining > 0 AND _loan.outstanding_principal > 0 THEN
    _principal_paid := LEAST(_remaining, _loan.outstanding_principal);
    _remaining := _remaining - _principal_paid;
  END IF;

  -- Update loan balances
  UPDATE public.loans SET
    penalty_amount = penalty_amount - _penalty_paid,
    outstanding_interest = outstanding_interest - _interest_paid,
    outstanding_principal = outstanding_principal - _principal_paid,
    status = CASE
      WHEN (outstanding_principal - _principal_paid) <= 0 AND (outstanding_interest - _interest_paid) <= 0 AND (penalty_amount - _penalty_paid) <= 0
      THEN 'closed'::loan_status
      ELSE status
    END
  WHERE id = _loan_id;

  -- Insert transactions for each component
  IF _penalty_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_penalty', _penalty_paid, CURRENT_DATE, 'paid', _performed_by, 'Penalty payment');
  END IF;

  IF _interest_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_interest', _interest_paid, CURRENT_DATE, 'paid', _performed_by, 'Interest payment');
  END IF;

  IF _principal_paid > 0 THEN
    INSERT INTO public.transactions (loan_id, client_id, type, amount, transaction_date, status, performed_by, notes)
    VALUES (_loan_id, _loan.client_id, 'loan_principal', _principal_paid, CURRENT_DATE, 'paid', _performed_by, 'Principal payment');
  END IF;

  -- Audit log
  _result := jsonb_build_object(
    'loan_id', _loan_id,
    'total_payment', _amount,
    'penalty_paid', _penalty_paid,
    'interest_paid', _interest_paid,
    'principal_paid', _principal_paid,
    'overpayment', _remaining
  );

  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details, user_id)
  VALUES ('loan_payment', 'loan', _loan_id, _result, _performed_by);

  RETURN _result;
END;
$$;
