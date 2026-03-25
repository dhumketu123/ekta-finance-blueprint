ALTER TABLE public.loan_products 
  ADD COLUMN IF NOT EXISTS upfront_savings_pct numeric DEFAULT 0, 
  ADD COLUMN IF NOT EXISTS compulsory_savings_amount numeric DEFAULT 0, 
  ADD COLUMN IF NOT EXISTS payment_frequency text DEFAULT 'Monthly';