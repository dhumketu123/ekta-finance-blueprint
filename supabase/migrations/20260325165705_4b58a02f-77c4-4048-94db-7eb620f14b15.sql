
CREATE OR REPLACE FUNCTION public.check_mfi_upfront_savings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _upfront_pct numeric;
  _required_savings numeric;
  _actual_savings numeric;
  _msg text;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    SELECT upfront_savings_pct INTO _upfront_pct FROM public.loan_products WHERE id = NEW.loan_product_id;
    IF COALESCE(_upfront_pct, 0) > 0 THEN
      _required_savings := (NEW.total_principal * _upfront_pct) / 100;
      SELECT COALESCE(SUM(balance), 0) INTO _actual_savings
      FROM public.savings_accounts
      WHERE client_id = NEW.client_id AND status = 'active';
      IF _actual_savings < _required_savings THEN
        _msg := format(
          'সতর্কতা: এই লোনটি বিতরণের জন্য গ্রাহকের অ্যাকাউন্টে কমপক্ষে ৳%s (ঋণের %s%% শতাংশ) সঞ্চয় থাকতে হবে। কিন্তু বর্তমানে জমা আছে মাত্র ৳%s। আগে সঞ্চয় জমা নিন।',
          _required_savings, _upfront_pct, _actual_savings
        );
        RAISE EXCEPTION '%', _msg;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
