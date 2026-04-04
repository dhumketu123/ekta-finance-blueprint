
-- Validation trigger: prevent negative financial values on investors
CREATE OR REPLACE FUNCTION public.validate_investor_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.capital < 0 THEN
        RAISE EXCEPTION 'Investor capital cannot be negative (got %)', NEW.capital;
    END IF;
    IF NEW.due_dividend < 0 THEN
        RAISE EXCEPTION 'Investor due_dividend cannot be negative (got %)', NEW.due_dividend;
    END IF;
    IF NEW.principal_amount < 0 THEN
        RAISE EXCEPTION 'Investor principal_amount cannot be negative (got %)', NEW.principal_amount;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_investor_financials ON investors;
CREATE TRIGGER trg_validate_investor_financials
    BEFORE INSERT OR UPDATE ON investors
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_investor_financials();
