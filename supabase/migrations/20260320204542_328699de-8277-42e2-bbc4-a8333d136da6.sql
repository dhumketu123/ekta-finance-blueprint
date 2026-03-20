
-- Fix search_path on new validation functions
CREATE OR REPLACE FUNCTION public.validate_loan_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.total_principal <= 0 THEN
    RAISE EXCEPTION 'total_principal must be greater than 0';
  END IF;
  IF NEW.emi_amount < 0 THEN
    RAISE EXCEPTION 'emi_amount cannot be negative';
  END IF;
  IF NEW.outstanding_principal < 0 THEN
    RAISE EXCEPTION 'outstanding_principal cannot be negative';
  END IF;
  IF NEW.penalty_amount < 0 THEN
    RAISE EXCEPTION 'penalty_amount cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_financial_transaction_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Transaction amount must be greater than 0';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_investor_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.capital < 0 THEN
    RAISE EXCEPTION 'Investor capital cannot be negative';
  END IF;
  IF NEW.principal_amount < 0 THEN
    RAISE EXCEPTION 'Investor principal_amount cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;
