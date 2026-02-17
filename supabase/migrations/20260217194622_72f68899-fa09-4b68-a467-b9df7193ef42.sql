
-- Fix process_investor_reinvest: add status filter + accumulated_profit update
CREATE OR REPLACE FUNCTION public.process_investor_reinvest(_investor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inv RECORD;
  _profit NUMERIC;
BEGIN
  -- Only process active investors
  SELECT * INTO _inv FROM public.investors 
  WHERE id = _investor_id AND deleted_at IS NULL AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  _profit := ROUND(_inv.capital * _inv.monthly_profit_percent / 100, 2);

  -- Record transaction
  INSERT INTO public.transactions (investor_id, type, amount, transaction_date, status)
  VALUES (_investor_id, 'investor_profit', _profit, CURRENT_DATE, 'paid');

  IF _inv.reinvest THEN
    -- Add profit to capital + accumulated_profit
    UPDATE public.investors 
    SET capital = capital + _profit, 
        accumulated_profit = accumulated_profit + _profit,
        last_profit_date = CURRENT_DATE
    WHERE id = _investor_id;
  ELSE
    -- Just update accumulated_profit
    UPDATE public.investors 
    SET accumulated_profit = accumulated_profit + _profit,
        last_profit_date = CURRENT_DATE
    WHERE id = _investor_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, details)
  VALUES ('profit_distributed', 'investor', _investor_id, 
    jsonb_build_object('profit', _profit, 'reinvest', _inv.reinvest, 'new_capital', 
      CASE WHEN _inv.reinvest THEN _inv.capital + _profit ELSE _inv.capital END));
END;
$function$;
