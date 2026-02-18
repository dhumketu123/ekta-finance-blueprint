
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS owner_id text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS owner_fixed_seq START 1;

CREATE OR REPLACE FUNCTION generate_owner_id()
RETURNS trigger AS $$
DECLARE
  next_val bigint;
BEGIN
  IF NEW.owner_id IS NULL AND NEW.role = 'owner' THEN
    next_val := nextval('owner_fixed_seq');
    NEW.owner_id := 'OWN-' || lpad(next_val::text, 2, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_owner_id ON profiles;

CREATE TRIGGER trg_owner_id
BEFORE INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION generate_owner_id();

CREATE INDEX IF NOT EXISTS idx_profiles_owner_id
ON profiles(owner_id);
