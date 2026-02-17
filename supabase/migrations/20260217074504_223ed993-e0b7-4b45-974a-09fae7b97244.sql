
-- Add partial_flag to transactions
ALTER TABLE public.transactions ADD COLUMN partial_flag BOOLEAN NOT NULL DEFAULT false;

-- Prevent duplicate savings deposit same day
CREATE OR REPLACE FUNCTION public.prevent_duplicate_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'savings_deposit' THEN
    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE client_id = NEW.client_id
        AND type = 'savings_deposit'
        AND transaction_date = NEW.transaction_date
        AND deleted_at IS NULL
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
    ) THEN
      RAISE EXCEPTION 'Duplicate savings deposit for this client on the same day is not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_duplicate_deposit
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_deposit();

-- Validate loan amount against product min/max
CREATE OR REPLACE FUNCTION public.validate_loan_amount()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _min NUMERIC;
  _max NUMERIC;
  _max_concurrent INTEGER;
  _active_count INTEGER;
BEGIN
  IF NEW.loan_product_id IS NOT NULL AND NEW.loan_amount IS NOT NULL AND NEW.loan_amount > 0 THEN
    SELECT min_amount, max_amount, max_concurrent
    INTO _min, _max, _max_concurrent
    FROM public.loan_products WHERE id = NEW.loan_product_id AND deleted_at IS NULL;

    IF NEW.loan_amount < _min THEN
      RAISE EXCEPTION 'Loan amount ৳% is below minimum ৳%', NEW.loan_amount, _min;
    END IF;
    IF NEW.loan_amount > _max THEN
      RAISE EXCEPTION 'Loan amount ৳% exceeds maximum ৳%', NEW.loan_amount, _max;
    END IF;

    -- Check max concurrent loans
    SELECT COUNT(*) INTO _active_count
    FROM public.clients
    WHERE id != NEW.id
      AND loan_product_id = NEW.loan_product_id
      AND status = 'active'
      AND loan_amount > 0
      AND deleted_at IS NULL;

    -- Note: This checks per-client concurrent loans - skip for now as schema needs client-level tracking
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_loan_amount
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.validate_loan_amount();

-- Function to calculate installment
CREATE OR REPLACE FUNCTION public.calculate_installment(
  _principal NUMERIC,
  _interest_rate NUMERIC,
  _tenure INTEGER
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ROUND((_principal + _principal * _interest_rate / 100) / _tenure, 2)
$$;

-- Function to process investor reinvest
CREATE OR REPLACE FUNCTION public.process_investor_reinvest(_investor_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv RECORD;
  _profit NUMERIC;
BEGIN
  SELECT * INTO _inv FROM public.investors WHERE id = _investor_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  _profit := ROUND(_inv.capital * _inv.monthly_profit_percent / 100, 2);

  -- Record transaction
  INSERT INTO public.transactions (investor_id, type, amount, transaction_date, status)
  VALUES (_investor_id, 'investor_profit', _profit, CURRENT_DATE, 'paid');

  IF _inv.reinvest THEN
    -- Add profit to capital
    UPDATE public.investors SET capital = capital + _profit, last_profit_date = CURRENT_DATE
    WHERE id = _investor_id;
  ELSE
    UPDATE public.investors SET last_profit_date = CURRENT_DATE
    WHERE id = _investor_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details)
  VALUES ('profit_distributed', 'investor', _investor_id, 
    jsonb_build_object('profit', _profit, 'reinvest', _inv.reinvest, 'new_capital', 
      CASE WHEN _inv.reinvest THEN _inv.capital + _profit ELSE _inv.capital END));
END;
$$;
