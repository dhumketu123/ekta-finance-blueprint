
ALTER TABLE public.investors
ADD CONSTRAINT investors_capital_non_negative
CHECK (capital >= 0);

ALTER TABLE public.investors
ADD CONSTRAINT investors_due_dividend_non_negative
CHECK (due_dividend >= 0);

ALTER TABLE public.investors
ADD CONSTRAINT investors_principal_amount_non_negative
CHECK (principal_amount >= 0);
