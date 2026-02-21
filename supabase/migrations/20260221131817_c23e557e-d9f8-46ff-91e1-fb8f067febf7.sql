
-- ═══════════════════════════════════════════════════════════
-- Phase 9: AI-Predictive Loan Risk Scoring Engine
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.predict_loan_risk()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loan RECORD;
  _results jsonb := '[]'::jsonb;
  _score integer;
  _overdue_days integer;
  _total_installments integer;
  _paid_installments integer;
  _overdue_installments integer;
  _partial_installments integer;
  _penalty_ratio numeric;
  _payment_regularity numeric;
  _days_to_next_due integer;
  _alert_type text;
  _high_risk_count integer := 0;
BEGIN
  FOR _loan IN
    SELECT 
      l.id AS loan_id,
      l.client_id,
      l.total_principal,
      l.outstanding_principal,
      l.outstanding_interest,
      l.penalty_amount,
      l.emi_amount,
      l.status,
      l.next_due_date,
      l.disbursement_date,
      l.maturity_date,
      l.loan_model,
      c.name_en,
      c.name_bn,
      c.phone
    FROM public.loans l
    JOIN public.clients c ON c.id = l.client_id
    WHERE l.status = 'active' AND l.deleted_at IS NULL AND c.deleted_at IS NULL
  LOOP
    _score := 0;

    -- ── 1. Schedule analysis (40 points max) ──────────────
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'paid'),
      COUNT(*) FILTER (WHERE status IN ('overdue')),
      COUNT(*) FILTER (WHERE status = 'partial')
    INTO _total_installments, _paid_installments, _overdue_installments, _partial_installments
    FROM public.loan_schedules
    WHERE loan_id = _loan.loan_id;

    -- Overdue ratio: up to 25 points
    IF _total_installments > 0 THEN
      _score := _score + LEAST(ROUND((_overdue_installments::numeric / _total_installments) * 100)::integer, 25);
    END IF;

    -- Partial payments signal: up to 15 points
    IF _total_installments > 0 THEN
      _score := _score + LEAST(ROUND((_partial_installments::numeric / _total_installments) * 50)::integer, 15);
    END IF;

    -- ── 2. Overdue duration (25 points max) ───────────────
    SELECT COALESCE(MAX(CURRENT_DATE - due_date), 0)
    INTO _overdue_days
    FROM public.loan_schedules
    WHERE loan_id = _loan.loan_id AND status IN ('overdue', 'partial');

    IF _overdue_days >= 90 THEN
      _score := _score + 25;
    ELSIF _overdue_days >= 60 THEN
      _score := _score + 20;
    ELSIF _overdue_days >= 30 THEN
      _score := _score + 15;
    ELSIF _overdue_days >= 14 THEN
      _score := _score + 10;
    ELSIF _overdue_days >= 7 THEN
      _score := _score + 5;
    END IF;

    -- ── 3. Penalty burden (15 points max) ─────────────────
    IF _loan.total_principal > 0 THEN
      _penalty_ratio := _loan.penalty_amount / _loan.total_principal;
      _score := _score + LEAST(ROUND(_penalty_ratio * 500)::integer, 15);
    END IF;

    -- ── 4. Outstanding ratio (10 points max) ──────────────
    IF _loan.total_principal > 0 THEN
      _score := _score + ROUND((_loan.outstanding_principal::numeric / _loan.total_principal) * 10)::integer;
    END IF;

    -- ── 5. Payment regularity bonus (reduce up to -10) ───
    IF _total_installments > 0 AND _paid_installments > 0 THEN
      _payment_regularity := _paid_installments::numeric / _total_installments;
      IF _payment_regularity >= 0.9 THEN
        _score := GREATEST(_score - 10, 0);
      ELSIF _payment_regularity >= 0.7 THEN
        _score := GREATEST(_score - 5, 0);
      END IF;
    END IF;

    -- Clamp score 0-100
    _score := LEAST(GREATEST(_score, 0), 100);

    -- ── Determine alert type ──────────────────────────────
    _days_to_next_due := COALESCE(_loan.next_due_date - CURRENT_DATE, 999);

    IF _score >= 80 THEN
      _alert_type := 'default_alert';
    ELSIF _score >= 70 THEN
      _alert_type := 'escalation_alert';
    ELSIF _overdue_days > 0 THEN
      _alert_type := 'overdue_alert';
    ELSIF _days_to_next_due BETWEEN 0 AND 3 THEN
      _alert_type := 'loan_due_today';
    ELSIF _days_to_next_due BETWEEN 4 AND 7 THEN
      _alert_type := 'upcoming_reminder';
    ELSE
      _alert_type := 'low_risk';
    END IF;

    IF _score >= 70 THEN
      _high_risk_count := _high_risk_count + 1;
    END IF;

    _results := _results || jsonb_build_array(jsonb_build_object(
      'client_id', _loan.client_id,
      'loan_id', _loan.loan_id,
      'client_name_en', _loan.name_en,
      'client_name_bn', _loan.name_bn,
      'phone', _loan.phone,
      'risk_score', _score,
      'overdue_days', _overdue_days,
      'outstanding_principal', _loan.outstanding_principal,
      'outstanding_interest', _loan.outstanding_interest,
      'penalty_amount', _loan.penalty_amount,
      'next_due_date', _loan.next_due_date,
      'predicted_7day_overdue', (_days_to_next_due <= 7 AND _score >= 40),
      'alert_type', _alert_type,
      'total_installments', _total_installments,
      'paid_installments', _paid_installments,
      'overdue_installments', _overdue_installments
    ));
  END LOOP;

  -- Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, details)
  VALUES ('predict_loan_risk', 'system', jsonb_build_object(
    'total_scored', jsonb_array_length(_results),
    'high_risk_count', _high_risk_count,
    'run_at', now()
  ));

  RETURN jsonb_build_object(
    'success', true,
    'total_scored', jsonb_array_length(_results),
    'high_risk_count', _high_risk_count,
    'predictions', _results,
    'run_at', now()
  );
END;
$$;
