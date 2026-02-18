
ALTER TABLE investors
ADD COLUMN IF NOT EXISTS serial_number bigint,
ADD COLUMN IF NOT EXISTS investor_id text UNIQUE;

CREATE OR REPLACE FUNCTION generate_investor_id()
RETURNS trigger AS $$
DECLARE
  yr text;
  seq_name text;
  next_val bigint;
BEGIN
  IF NEW.investor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  yr := to_char(now(), 'YY');
  seq_name := 'investor_seq_' || yr;

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1001 MINVALUE 1001', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;

  NEW.serial_number := next_val;
  NEW.investor_id := 'INV-' || yr || '-' || next_val;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_investor_id ON investors;

CREATE TRIGGER trg_investor_id
BEFORE INSERT ON investors
FOR EACH ROW
EXECUTE FUNCTION generate_investor_id();

CREATE INDEX IF NOT EXISTS idx_investors_investor_id
ON investors(investor_id);
