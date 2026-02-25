
-- 1. Add PIN columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS transaction_pin_hash text,
  ADD COLUMN IF NOT EXISTS pin_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pin_updated_at timestamp with time zone;

-- 2. RPC: set or update transaction PIN (bcrypt hashed)
CREATE OR REPLACE FUNCTION public.create_or_update_transaction_pin(_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  IF length(_new_pin) < 4 OR length(_new_pin) > 6 THEN
    RETURN jsonb_build_object('status', 'invalid_length');
  END IF;

  UPDATE public.profiles
  SET
    transaction_pin_hash = extensions.crypt(_new_pin, extensions.gen_salt('bf', 10)),
    pin_attempts = 0,
    pin_locked_until = NULL,
    pin_updated_at = now(),
    updated_at = now()
  WHERE id = _uid;

  RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 3. RPC: verify transaction PIN with lockout
CREATE OR REPLACE FUNCTION public.verify_transaction_pin(_input_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hash text;
  _attempts integer;
  _locked_until timestamp with time zone;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;

  SELECT transaction_pin_hash, pin_attempts, pin_locked_until
  INTO _hash, _attempts, _locked_until
  FROM public.profiles
  WHERE id = _uid;

  -- No PIN set
  IF _hash IS NULL THEN
    RETURN jsonb_build_object('status', 'no_pin');
  END IF;

  -- Check lockout
  IF _locked_until IS NOT NULL AND _locked_until > now() THEN
    RETURN jsonb_build_object(
      'status', 'locked',
      'locked_until', _locked_until
    );
  END IF;

  -- Verify hash
  IF _hash = extensions.crypt(_input_pin, _hash) THEN
    -- Correct: reset attempts
    UPDATE public.profiles
    SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = _uid;

    RETURN jsonb_build_object('status', 'success');
  ELSE
    -- Wrong: increment attempts
    _attempts := COALESCE(_attempts, 0) + 1;

    IF _attempts >= 3 THEN
      UPDATE public.profiles
      SET pin_attempts = 0, pin_locked_until = now() + interval '5 minutes'
      WHERE id = _uid;

      RETURN jsonb_build_object('status', 'locked', 'locked_until', now() + interval '5 minutes');
    ELSE
      UPDATE public.profiles
      SET pin_attempts = _attempts
      WHERE id = _uid;

      RETURN jsonb_build_object('status', 'invalid', 'remaining_attempts', 3 - _attempts);
    END IF;
  END IF;
END;
$$;

-- 4. Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_or_update_transaction_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transaction_pin(text) TO authenticated;
