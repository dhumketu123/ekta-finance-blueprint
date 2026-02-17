
CREATE OR REPLACE FUNCTION public.calculate_installment(
  _principal NUMERIC,
  _interest_rate NUMERIC,
  _tenure INTEGER
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND((_principal + _principal * _interest_rate / 100) / _tenure, 2)
$$;
