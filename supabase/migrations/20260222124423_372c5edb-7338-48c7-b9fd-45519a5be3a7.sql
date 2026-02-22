
-- ═══════════════════════════════════════════════════════════════
-- Phase 1: Advance Buffer / Suspense Account
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.advance_buffer (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  loan_id uuid REFERENCES public.loans(id),
  savings_id uuid REFERENCES public.savings_accounts(id),
  amount numeric NOT NULL CHECK (amount > 0),
  buffer_type text NOT NULL DEFAULT 'advance_installment' CHECK (buffer_type IN ('advance_installment', 'advance_savings', 'suspense')),
  post_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'cancelled')),
  posted_at timestamptz,
  posted_by uuid,
  source_transaction_id uuid REFERENCES public.financial_transactions(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advance_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access advance_buffer" ON public.advance_buffer FOR ALL USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());
CREATE POLICY "Treasurer full access advance_buffer" ON public.advance_buffer FOR ALL USING (public.is_treasurer()) WITH CHECK (public.is_treasurer());
CREATE POLICY "Field officers view assigned advance_buffer" ON public.advance_buffer FOR SELECT USING (public.is_field_officer() AND public.is_assigned_to_client(client_id));

CREATE INDEX idx_advance_buffer_post_date ON public.advance_buffer (post_date) WHERE status = 'pending';
CREATE INDEX idx_advance_buffer_client ON public.advance_buffer (client_id);

-- ═══════════════════════════════════════════════════════════════
-- Phase 2: Credit Scores (AI-driven)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.credit_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  score integer NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  payment_regularity numeric DEFAULT 0,
  overdue_frequency integer DEFAULT 0,
  avg_days_late numeric DEFAULT 0,
  total_on_time_payments integer DEFAULT 0,
  total_late_payments integer DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  factors jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access credit_scores" ON public.credit_scores FOR ALL USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());
CREATE POLICY "Treasurer view credit_scores" ON public.credit_scores FOR SELECT USING (public.is_treasurer());
CREATE POLICY "Field officers view assigned credit_scores" ON public.credit_scores FOR SELECT USING (public.is_field_officer() AND public.is_assigned_to_client(client_id));

CREATE INDEX idx_credit_scores_risk ON public.credit_scores (risk_level);
CREATE INDEX idx_credit_scores_score ON public.credit_scores (score);

-- ═══════════════════════════════════════════════════════════════
-- Phase 3: Event Sourcing (Temporal Ledger / Time-Machine)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.event_sourcing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('loan', 'savings', 'client', 'investor', 'transaction', 'ledger', 'system')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_before jsonb,
  snapshot_after jsonb,
  performed_by uuid,
  hash_prev text,
  hash_self text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_sourcing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access event_sourcing" ON public.event_sourcing FOR ALL USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());
CREATE POLICY "Treasurer view event_sourcing" ON public.event_sourcing FOR SELECT USING (public.is_treasurer());

-- Append-only: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION public.prevent_event_sourcing_modification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Event sourcing entries are immutable — cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Event sourcing entries are immutable — cannot be deleted';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_event_sourcing_edit
BEFORE UPDATE OR DELETE ON public.event_sourcing
FOR EACH ROW EXECUTE FUNCTION public.prevent_event_sourcing_modification();

CREATE INDEX idx_event_sourcing_entity ON public.event_sourcing (entity_type, entity_id);
CREATE INDEX idx_event_sourcing_created ON public.event_sourcing (created_at DESC);
CREATE INDEX idx_event_sourcing_action ON public.event_sourcing (action);

-- ═══════════════════════════════════════════════════════════════
-- Hash-chain auto-generation trigger for event_sourcing
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_event_hash()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _prev_hash text;
BEGIN
  -- Get the last hash for this entity
  SELECT hash_self INTO _prev_hash
  FROM public.event_sourcing
  WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id
  ORDER BY created_at DESC
  LIMIT 1;

  NEW.hash_prev := COALESCE(_prev_hash, 'GENESIS');
  NEW.hash_self := encode(
    sha256(
      convert_to(
        COALESCE(NEW.hash_prev, '') || NEW.entity_type || NEW.entity_id::text || NEW.action || NEW.payload::text || NEW.created_at::text,
        'UTF8'
      )
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_hash_event_sourcing
BEFORE INSERT ON public.event_sourcing
FOR EACH ROW EXECUTE FUNCTION public.generate_event_hash();

-- ═══════════════════════════════════════════════════════════════
-- Function: Post advance buffer entries (for cron job)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.post_advance_buffer_entries()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row RECORD;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT * FROM public.advance_buffer
    WHERE status = 'pending' AND post_date <= CURRENT_DATE
    ORDER BY post_date, created_at
  LOOP
    -- Mark as posted
    UPDATE public.advance_buffer
    SET status = 'posted', posted_at = now(), updated_at = now()
    WHERE id = _row.id;

    -- Log event
    INSERT INTO public.event_sourcing (entity_type, entity_id, action, payload, performed_by)
    VALUES (
      CASE WHEN _row.loan_id IS NOT NULL THEN 'loan' ELSE 'savings' END,
      COALESCE(_row.loan_id, _row.savings_id, _row.client_id),
      'advance_buffer_posted',
      jsonb_build_object('buffer_id', _row.id, 'amount', _row.amount, 'post_date', _row.post_date, 'buffer_type', _row.buffer_type),
      _row.posted_by
    );

    _count := _count + 1;
  END LOOP;

  RETURN jsonb_build_object('posted_count', _count, 'run_at', now());
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Function: Calculate credit score for a client
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.calculate_credit_score(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _score integer := 50;
  _total_installments integer := 0;
  _paid_on_time integer := 0;
  _late_payments integer := 0;
  _overdue_count integer := 0;
  _avg_late_days numeric := 0;
  _regularity numeric := 0;
  _risk text := 'medium';
  _factors jsonb;
BEGIN
  -- Count schedule stats
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid' AND (paid_date IS NULL OR paid_date <= due_date)),
    COUNT(*) FILTER (WHERE status = 'paid' AND paid_date > due_date),
    COUNT(*) FILTER (WHERE status IN ('overdue', 'partial')),
    COALESCE(AVG(CASE WHEN paid_date > due_date THEN paid_date - due_date ELSE 0 END), 0)
  INTO _total_installments, _paid_on_time, _late_payments, _overdue_count, _avg_late_days
  FROM public.loan_schedules
  WHERE client_id = _client_id;

  -- Calculate regularity
  IF _total_installments > 0 THEN
    _regularity := ROUND(_paid_on_time::numeric / _total_installments * 100, 1);
  END IF;

  -- Score calculation
  -- Base: regularity (0-40 points)
  _score := ROUND(_regularity * 0.4)::integer;
  -- Bonus for on-time (0-20 points)
  IF _total_installments > 0 THEN
    _score := _score + LEAST(ROUND((_paid_on_time::numeric / GREATEST(_total_installments, 1)) * 20)::integer, 20);
  END IF;
  -- Penalty for overdue (-0 to -20)
  _score := _score - LEAST(_overdue_count * 5, 20);
  -- Penalty for avg late days (-0 to -10)
  _score := _score - LEAST(ROUND(_avg_late_days)::integer, 10);
  -- Base 30 for having any history
  IF _total_installments > 0 THEN _score := _score + 30; END IF;
  -- Clamp
  _score := LEAST(GREATEST(_score, 0), 100);

  -- Risk level
  IF _score >= 80 THEN _risk := 'low';
  ELSIF _score >= 60 THEN _risk := 'medium';
  ELSIF _score >= 40 THEN _risk := 'high';
  ELSE _risk := 'critical';
  END IF;

  _factors := jsonb_build_object(
    'total_installments', _total_installments,
    'on_time_payments', _paid_on_time,
    'late_payments', _late_payments,
    'current_overdue', _overdue_count,
    'avg_days_late', ROUND(_avg_late_days, 1),
    'payment_regularity', _regularity
  );

  -- Upsert credit score
  INSERT INTO public.credit_scores (client_id, score, risk_level, payment_regularity, overdue_frequency, avg_days_late, total_on_time_payments, total_late_payments, last_calculated_at, factors, updated_at)
  VALUES (_client_id, _score, _risk, _regularity, _overdue_count, _avg_late_days, _paid_on_time, _late_payments, now(), _factors, now())
  ON CONFLICT (client_id) DO UPDATE SET
    score = EXCLUDED.score,
    risk_level = EXCLUDED.risk_level,
    payment_regularity = EXCLUDED.payment_regularity,
    overdue_frequency = EXCLUDED.overdue_frequency,
    avg_days_late = EXCLUDED.avg_days_late,
    total_on_time_payments = EXCLUDED.total_on_time_payments,
    total_late_payments = EXCLUDED.total_late_payments,
    last_calculated_at = EXCLUDED.last_calculated_at,
    factors = EXCLUDED.factors,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('client_id', _client_id, 'score', _score, 'risk_level', _risk, 'factors', _factors);
END;
$$;
