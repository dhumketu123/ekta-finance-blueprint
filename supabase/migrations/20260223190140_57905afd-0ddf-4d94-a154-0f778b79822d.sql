
-- PHASE 9: REAL-TIME ANOMALY INTELLIGENCE

CREATE TABLE public.risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  client_id UUID REFERENCES clients(id),
  officer_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  risk_score INTEGER NOT NULL DEFAULT 50,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES profiles(id)
);

CREATE OR REPLACE FUNCTION prevent_risk_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.resolved IS DISTINCT FROM OLD.resolved OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by THEN
      IF NEW.event_type <> OLD.event_type OR NEW.risk_score <> OLD.risk_score OR NEW.reason IS DISTINCT FROM OLD.reason
         OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.officer_id IS DISTINCT FROM OLD.officer_id THEN
        RAISE EXCEPTION 'Cannot modify risk event core fields';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only resolution updates allowed on risk_events';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Cannot delete risk events'; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_events_immutable BEFORE UPDATE OR DELETE ON risk_events FOR EACH ROW EXECUTE FUNCTION prevent_risk_event_mutation();

ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin_owner select risk_events" ON risk_events AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin_or_owner());
CREATE POLICY "Admin_owner insert risk_events" ON risk_events AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_owner());
CREATE POLICY "Admin_owner update risk_events" ON risk_events AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin_or_owner());
CREATE POLICY "Treasurer view risk_events" ON risk_events AS RESTRICTIVE FOR SELECT TO authenticated USING (is_treasurer());

CREATE INDEX idx_risk_events_branch ON risk_events(branch_id);
CREATE INDEX idx_risk_events_client ON risk_events(client_id);
CREATE INDEX idx_risk_events_officer ON risk_events(officer_id);
CREATE INDEX idx_risk_events_type ON risk_events(event_type);
CREATE INDEX idx_risk_events_unresolved ON risk_events(resolved) WHERE resolved = FALSE;

CREATE TABLE public.officer_risk_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES profiles(id),
  period_month DATE NOT NULL,
  late_collection_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  adjustment_frequency INTEGER NOT NULL DEFAULT 0,
  fine_override_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_collections INTEGER NOT NULL DEFAULT 0,
  late_collections INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(officer_id, period_month)
);

ALTER TABLE officer_risk_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin_owner select officer_risk_profile" ON officer_risk_profile AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin_or_owner());
CREATE POLICY "Admin_owner insert officer_risk_profile" ON officer_risk_profile AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_owner());
CREATE POLICY "Admin_owner update officer_risk_profile" ON officer_risk_profile AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin_or_owner());
CREATE POLICY "Officers view own risk_profile" ON officer_risk_profile AS RESTRICTIVE FOR SELECT TO authenticated USING (officer_id = auth.uid());
CREATE POLICY "Treasurer view officer_risk_profile" ON officer_risk_profile AS RESTRICTIVE FOR SELECT TO authenticated USING (is_treasurer());

CREATE INDEX idx_officer_risk_profile_officer ON officer_risk_profile(officer_id);
CREATE INDEX idx_officer_risk_profile_period ON officer_risk_profile(period_month);

-- Anomaly detection trigger
CREATE OR REPLACE FUNCTION detect_anomaly_on_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
  avg_payment NUMERIC; entry_count INTEGER; recent_count INTEGER;
BEGIN
  IF NEW.reference_type IN ('emi_payment', 'loan_repayment', 'collection') THEN
    SELECT AVG(amount), COUNT(*) INTO avg_payment, entry_count FROM ledger_entries WHERE branch_id = NEW.branch_id AND reference_type = NEW.reference_type AND id <> NEW.id;
    IF entry_count >= 3 AND avg_payment IS NOT NULL AND NEW.amount > avg_payment * 2 THEN
      INSERT INTO risk_events (branch_id, officer_id, event_type, risk_score, reason, metadata)
      VALUES (NEW.branch_id, NEW.created_by, 'UNUSUAL_PAYMENT_SPIKE', LEAST(95, 50 + ((NEW.amount / NULLIF(avg_payment, 0)) * 10)::integer),
        format('Payment exceeds 2x avg: %s vs %s', NEW.amount::text, round(avg_payment, 2)::text),
        jsonb_build_object('ledger_entry_id', NEW.id, 'amount', NEW.amount, 'avg_amount', round(avg_payment, 2)));
    END IF;
  END IF;
  SELECT COUNT(*) INTO recent_count FROM ledger_entries WHERE created_by = NEW.created_by AND created_at >= (now() - interval '10 minutes') AND id <> NEW.id;
  IF recent_count >= 3 THEN
    IF NOT EXISTS (SELECT 1 FROM risk_events WHERE officer_id = NEW.created_by AND event_type = 'RAPID_TRANSACTIONS' AND created_at >= (now() - interval '30 minutes')) THEN
      INSERT INTO risk_events (branch_id, officer_id, event_type, risk_score, reason, metadata)
      VALUES (NEW.branch_id, NEW.created_by, 'RAPID_TRANSACTIONS', 70, format('%s transactions in 10 minutes', (recent_count + 1)::text),
        jsonb_build_object('transaction_count', recent_count + 1, 'window_minutes', 10));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

CREATE TRIGGER anomaly_detection_trigger AFTER INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION detect_anomaly_on_ledger_entry();

-- Monthly officer risk scoring
CREATE OR REPLACE FUNCTION calculate_monthly_officer_risk(p_month DATE DEFAULT date_trunc('month', now())::date)
RETURNS JSONB AS $$
DECLARE
  officer RECORD; result JSONB := '[]'::jsonb;
  v_late_pct NUMERIC; v_adj_freq INTEGER; v_fine_rate NUMERIC; v_risk_score INTEGER; v_risk_level TEXT; v_total INTEGER; v_late INTEGER;
BEGIN
  FOR officer IN SELECT DISTINCT p.id as officer_id FROM profiles p WHERE p.role = 'field_officer' LOOP
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('rescheduled', 'failed')) INTO v_total, v_late FROM commitments WHERE officer_id = officer.officer_id AND commitment_date >= p_month AND commitment_date < p_month + interval '1 month';
    v_late_pct := CASE WHEN v_total > 0 THEN (v_late::numeric / v_total * 100) ELSE 0 END;
    SELECT COUNT(*) INTO v_adj_freq FROM financial_transactions WHERE created_by = officer.officer_id AND transaction_type = 'adjustment_entry' AND created_at >= p_month AND created_at < p_month + interval '1 month';
    SELECT CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE penalty_suspended = true)::numeric / COUNT(*) * 100) ELSE 0 END INTO v_fine_rate FROM commitments WHERE officer_id = officer.officer_id AND commitment_date >= p_month AND commitment_date < p_month + interval '1 month';
    v_risk_score := LEAST(100, GREATEST(0, (v_late_pct * 0.5 + v_adj_freq * 10 + v_fine_rate * 0.3)::integer));
    v_risk_level := CASE WHEN v_risk_score >= 80 THEN 'critical' WHEN v_risk_score >= 60 THEN 'high' WHEN v_risk_score >= 40 THEN 'medium' ELSE 'low' END;
    INSERT INTO officer_risk_profile (officer_id, period_month, late_collection_pct, adjustment_frequency, fine_override_rate, total_collections, late_collections, risk_score, risk_level)
    VALUES (officer.officer_id, p_month, round(v_late_pct, 2), v_adj_freq, round(v_fine_rate, 2), v_total, v_late, v_risk_score, v_risk_level)
    ON CONFLICT (officer_id, period_month) DO UPDATE SET late_collection_pct = EXCLUDED.late_collection_pct, adjustment_frequency = EXCLUDED.adjustment_frequency, fine_override_rate = EXCLUDED.fine_override_rate, total_collections = EXCLUDED.total_collections, late_collections = EXCLUDED.late_collections, risk_score = EXCLUDED.risk_score, risk_level = EXCLUDED.risk_level, updated_at = now();
    IF v_risk_score >= 70 THEN
      INSERT INTO risk_events (branch_id, officer_id, event_type, risk_score, reason, metadata) SELECT p.branch_id, officer.officer_id, 'HIGH_RISK_OFFICER', v_risk_score, format('Officer risk score %s: late %s%%', v_risk_score, round(v_late_pct, 1)), jsonb_build_object('period', p_month, 'late_pct', round(v_late_pct, 2), 'adjustment_freq', v_adj_freq) FROM profiles p WHERE p.id = officer.officer_id;
    END IF;
    result := result || jsonb_build_object('officer_id', officer.officer_id, 'risk_score', v_risk_score, 'risk_level', v_risk_level);
  END LOOP;
  RETURN jsonb_build_object('officers_scored', jsonb_array_length(result), 'results', result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Branch risk summary
CREATE OR REPLACE FUNCTION get_branch_risk_summary() RETURNS JSONB AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_agg(row_data) INTO result FROM (
    SELECT jsonb_build_object('branch_id', b.id, 'branch_name', b.name, 'branch_name_bn', b.name_bn, 'unresolved_events', COALESCE(re.cnt, 0), 'avg_risk_score', COALESCE(re.avg_score, 0), 'max_risk_score', COALESCE(re.max_score, 0), 'critical_count', COALESCE(re.critical, 0), 'locked', COALESCE(re.max_score, 0) >= 90) as row_data
    FROM branches b LEFT JOIN (SELECT branch_id, COUNT(*) as cnt, ROUND(AVG(risk_score)) as avg_score, MAX(risk_score) as max_score, COUNT(*) FILTER (WHERE risk_score >= 80) as critical FROM risk_events WHERE resolved = FALSE GROUP BY branch_id) re ON re.branch_id = b.id WHERE b.is_active = TRUE ORDER BY COALESCE(re.max_score, 0) DESC
  ) sub;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get anomaly alerts
CREATE OR REPLACE FUNCTION get_anomaly_alerts(p_limit INTEGER DEFAULT 50) RETURNS JSONB AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_agg(row_data) INTO result FROM (
    SELECT jsonb_build_object('id', re.id, 'event_type', re.event_type, 'risk_score', re.risk_score, 'reason', re.reason, 'metadata', re.metadata, 'created_at', re.created_at, 'resolved', re.resolved, 'branch_name', b.name, 'branch_name_bn', b.name_bn, 'officer_name', p.name_en, 'officer_name_bn', p.name_bn, 'client_name', c.name_en, 'client_name_bn', c.name_bn) as row_data
    FROM risk_events re LEFT JOIN branches b ON b.id = re.branch_id LEFT JOIN profiles p ON p.id = re.officer_id LEFT JOIN clients c ON c.id = re.client_id ORDER BY re.resolved ASC, re.risk_score DESC, re.created_at DESC LIMIT p_limit
  ) sub;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Resolve anomaly alert
CREATE OR REPLACE FUNCTION resolve_anomaly_alert(p_event_id UUID) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE risk_events SET resolved = TRUE, resolved_at = now(), resolved_by = auth.uid() WHERE id = p_event_id AND resolved = FALSE;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
