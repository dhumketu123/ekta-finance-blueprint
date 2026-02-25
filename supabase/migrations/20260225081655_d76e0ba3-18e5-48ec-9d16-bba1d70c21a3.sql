
-- Drop and recreate both RPCs with hardened settings

CREATE OR REPLACE FUNCTION public.create_or_update_transaction_pin(_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    transaction_pin_hash = extensions.crypt(_new_pin, extensions.gen_salt('bf', 12)),
    pin_attempts = 0,
    pin_locked_until = NULL,
    pin_updated_at = now(),
    updated_at = now()
  WHERE id = _uid;

  RETURN jsonb_build_object('status', 'success');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_transaction_pin(_input_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hash text;
  _attempts integer;
  _locked_until timestamp with time zone;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized', 'remaining_attempts', NULL, 'locked_until', NULL);
  END IF;

  SELECT transaction_pin_hash, pin_attempts, pin_locked_until
  INTO _hash, _attempts, _locked_until
  FROM public.profiles
  WHERE id = _uid;

  IF _hash IS NULL THEN
    RETURN jsonb_build_object('status', 'no_pin', 'remaining_attempts', NULL, 'locked_until', NULL);
  END IF;

  -- LOCK CHECK FIRST — never compare before this
  IF _locked_until IS NOT NULL AND _locked_until > now() THEN
    RETURN jsonb_build_object('status', 'locked', 'remaining_attempts', 0, 'locked_until', _locked_until);
  END IF;

  -- bcrypt compare AFTER lock check
  IF _hash = extensions.crypt(_input_pin, _hash) THEN
    UPDATE public.profiles
    SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = _uid;

    RETURN jsonb_build_object('status', 'success', 'remaining_attempts', 3, 'locked_until', NULL);
  ELSE
    _attempts := COALESCE(_attempts, 0) + 1;

    IF _attempts >= 3 THEN
      UPDATE public.profiles
      SET pin_attempts = 0, pin_locked_until = now() + interval '5 minutes'
      WHERE id = _uid;

      RETURN jsonb_build_object('status', 'locked', 'remaining_attempts', 0, 'locked_until', now() + interval '5 minutes');
    ELSE
      UPDATE public.profiles
      SET pin_attempts = _attempts
      WHERE id = _uid;

      RETURN jsonb_build_object('status', 'invalid', 'remaining_attempts', 3 - _attempts, 'locked_until', NULL);
    END IF;
  END IF;
END;
$$;
