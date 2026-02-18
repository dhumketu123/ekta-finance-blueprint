
-- 1. Add columns
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS serial_number bigint,
  ADD COLUMN IF NOT EXISTS member_id text;

-- Add unique constraint on member_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_member_id_unique
  ON public.clients(member_id)
  WHERE member_id IS NOT NULL;

-- 2. Performance index
CREATE INDEX IF NOT EXISTS idx_clients_member_id
  ON public.clients(member_id);

-- 3. Year-based sequence function
CREATE OR REPLACE FUNCTION public.generate_year_based_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year text;
  seq_name text;
  next_number bigint;
BEGIN
  -- Only generate if member_id not already set
  IF NEW.member_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  current_year := to_char(now(), 'YY');
  seq_name := 'client_seq_' || current_year;

  -- Create sequence if not exists (starts at 1001)
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1001 MINVALUE 1001', seq_name);

  -- Get next value atomically (no race condition)
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_number;

  NEW.serial_number := next_number;
  NEW.member_id := 'EFG-' || current_year || '-' || next_number;

  RETURN NEW;
END;
$$;

-- 4. Trigger
DROP TRIGGER IF EXISTS set_year_based_client_id ON public.clients;

CREATE TRIGGER set_year_based_client_id
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_year_based_client_id();
