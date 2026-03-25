
CREATE OR REPLACE FUNCTION public.block_closed_loan_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.loan_id IS NOT NULL AND NEW.type IN ('loan_principal', 'loan_interest', 'loan_penalty', 'loan_repayment', 'loan_disbursement') THEN
    IF EXISTS (
      SELECT 1 FROM public.loans
      WHERE id = NEW.loan_id
        AND status = 'closed'
        AND (outstanding_principal + outstanding_interest + penalty_amount) <= 0
    ) THEN
      RAISE EXCEPTION 'Cannot insert transaction for closed loan %', NEW.loan_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
