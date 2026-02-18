
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS serial_number bigint,
ADD COLUMN IF NOT EXISTS loan_id text UNIQUE;

CREATE OR REPLACE FUNCTION generate_loan_id()
RETURNS trigger AS $$
DECLARE
  yr text;
  seq_name text;
  next_val bigint;
BEGIN
  IF NEW.loan_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  yr := to_char(now(), 'YY');
  seq_name := 'loan_seq_' || yr;

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1001 MINVALUE 1001', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;

  NEW.serial_number := next_val;
  NEW.loan_id := 'LN-' || yr || '-' || next_val;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_loan_id ON loans;

CREATE TRIGGER trg_loan_id
BEFORE INSERT ON loans
FOR EACH ROW
EXECUTE FUNCTION generate_loan_id();

CREATE INDEX IF NOT EXISTS idx_loans_loan_id
ON loans(loan_id);
