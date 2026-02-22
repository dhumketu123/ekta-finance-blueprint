
-- Drop existing function with old return type
DROP FUNCTION IF EXISTS public.calculate_credit_score(UUID);

-- Enhanced credit score with 5 weighted factors (0-100 scale)
CREATE FUNCTION public.calculate_credit_score(_client_id UUID)
RETURNS JSON AS $$
DECLARE
  _total_schedules INT; _on_time INT; _late INT; _avg_late NUMERIC;
  _overdue_freq INT; _regularity NUMERIC; _score INT; _risk TEXT;
  _closed_loans INT; _savings_deposits INT; _savings_bonus NUMERIC;
  _closure_bonus NUMERIC; _early_bonus NUMERIC; _early_payments INT;
BEGIN
  SET search_path TO 'public';

  SELECT COUNT(*) INTO _total_schedules FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.status IN ('paid', 'partial', 'overdue');
  IF _total_schedules = 0 THEN _total_schedules := 1; END IF;

  SELECT COUNT(*) INTO _on_time FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.status = 'paid' AND (ls.paid_date IS NULL OR ls.paid_date <= ls.due_date);

  SELECT COUNT(*) INTO _early_payments FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.status = 'paid' AND ls.paid_date IS NOT NULL AND ls.paid_date <= (ls.due_date - INTERVAL '3 days');

  SELECT COUNT(*) INTO _late FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.status = 'paid' AND ls.paid_date IS NOT NULL AND ls.paid_date > ls.due_date;

  SELECT COALESCE(AVG(GREATEST(0, ls.paid_date - ls.due_date)), 0) INTO _avg_late
  FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.paid_date IS NOT NULL AND ls.paid_date > ls.due_date;

  SELECT COUNT(*) INTO _overdue_freq FROM loan_schedules ls JOIN loans l ON l.id = ls.loan_id
  WHERE l.client_id = _client_id AND ls.status = 'overdue';

  SELECT COUNT(*) INTO _closed_loans FROM loans WHERE client_id = _client_id AND status = 'closed';
  SELECT COUNT(*) INTO _savings_deposits FROM transactions WHERE client_id = _client_id AND type = 'savings_deposit' AND deleted_at IS NULL;

  _regularity := ROUND((_on_time::NUMERIC / _total_schedules) * 100, 1);
  _score := ROUND((_on_time::NUMERIC / _total_schedules) * 40);
  _score := _score + GREATEST(0, 25 - (_overdue_freq * 5));
  _early_bonus := LEAST(10, _early_payments * 2);
  _score := _score + _early_bonus;
  _closure_bonus := LEAST(15, _closed_loans * 5);
  _score := _score + _closure_bonus;
  _savings_bonus := LEAST(10, ROUND(_savings_deposits::NUMERIC / GREATEST(1, _total_schedules) * 10));
  _score := _score + _savings_bonus;
  _score := GREATEST(0, LEAST(100, _score));

  _risk := CASE WHEN _score >= 80 THEN 'low' WHEN _score >= 60 THEN 'medium' WHEN _score >= 40 THEN 'high' ELSE 'critical' END;

  INSERT INTO credit_scores (client_id, score, risk_level, payment_regularity, total_on_time_payments, total_late_payments, avg_days_late, overdue_frequency, last_calculated_at, factors)
  VALUES (_client_id, _score, _risk, _regularity, _on_time, _late, _avg_late, _overdue_freq, NOW(),
    jsonb_build_object('on_time_weight', ROUND((_on_time::NUMERIC / _total_schedules) * 40), 'overdue_penalty', GREATEST(0, 25 - (_overdue_freq * 5)),
      'early_bonus', _early_bonus, 'closure_bonus', _closure_bonus, 'savings_bonus', _savings_bonus,
      'closed_loans', _closed_loans, 'savings_deposits', _savings_deposits, 'early_payments', _early_payments))
  ON CONFLICT (client_id) DO UPDATE SET
    score = EXCLUDED.score, risk_level = EXCLUDED.risk_level, payment_regularity = EXCLUDED.payment_regularity,
    total_on_time_payments = EXCLUDED.total_on_time_payments, total_late_payments = EXCLUDED.total_late_payments,
    avg_days_late = EXCLUDED.avg_days_late, overdue_frequency = EXCLUDED.overdue_frequency,
    last_calculated_at = EXCLUDED.last_calculated_at, factors = EXCLUDED.factors, updated_at = NOW();

  RETURN json_build_object('score', _score, 'risk', _risk, 'regularity', _regularity);
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';

-- Ledger integrity verification
CREATE OR REPLACE FUNCTION public.verify_event_chain_integrity()
RETURNS JSON AS $$
DECLARE
  _total INT; _broken INT := 0; _prev_hash TEXT := NULL; _rec RECORD;
BEGIN
  SET search_path TO 'public';
  SELECT COUNT(*) INTO _total FROM event_sourcing;
  FOR _rec IN SELECT id, hash_self, hash_prev FROM event_sourcing ORDER BY created_at ASC LOOP
    IF _prev_hash IS NOT NULL AND _rec.hash_prev IS DISTINCT FROM _prev_hash THEN _broken := _broken + 1; END IF;
    _prev_hash := _rec.hash_self;
  END LOOP;
  RETURN json_build_object('total_events', _total, 'broken_links', _broken,
    'integrity', CASE WHEN _broken = 0 THEN 'valid' ELSE 'compromised' END, 'verified_at', NOW());
END;
$$ LANGUAGE plpgsql SET search_path TO 'public';
