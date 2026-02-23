
-- Add KYC, tenure, and nominee fields to investors table
ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS nid_number varchar(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_of_fund text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tenure_years integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nominee_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nominee_relation text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nominee_phone varchar(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nominee_nid varchar(20) DEFAULT NULL;
