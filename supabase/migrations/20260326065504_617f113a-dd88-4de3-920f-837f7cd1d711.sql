ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS trust_tier text DEFAULT 'Standard';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS trust_score integer DEFAULT 0;