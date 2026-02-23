
-- ═══════════════════════════════════════════════════════════════
-- PHASE 1: GIGA FACTORY FOUNDATION LAYER
-- ═══════════════════════════════════════════════════════════════

-- SECTION 1: Enhance Ledger Entries
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS hash_signature text;

-- SECTION 2: FEATURE FLAGS TABLE
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  enabled_for_role text NOT NULL DEFAULT 'all',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access feature_flags"
  ON public.feature_flags FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Authenticated read feature_flags"
  ON public.feature_flags FOR SELECT
  USING (true);

INSERT INTO public.feature_flags (feature_name, is_enabled, enabled_for_role, description) VALUES
  ('omnibar_enabled', false, 'all', 'Enable smart omnibar search'),
  ('swipe_enabled', false, 'all', 'Enable swipe gestures'),
  ('commitment_enabled', false, 'all', 'Enable commitment tracking'),
  ('gamification_enabled', false, 'all', 'Enable gamification features'),
  ('mobile_snapshot_enabled', false, 'all', 'Enable mobile snapshot capture'),
  ('voice_ledger_enabled', false, 'admin', 'Enable voice-based ledger input'),
  ('ai_prediction_enabled', false, 'admin', 'Enable AI risk prediction'),
  ('bulk_collection_enabled', true, 'all', 'Enable bulk collection form')
ON CONFLICT (feature_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(_feature_name text, _user_role text DEFAULT 'all')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feature_flags
    WHERE feature_name = _feature_name
      AND is_enabled = true
      AND (enabled_for_role = 'all' OR enabled_for_role = _user_role)
  );
$$;

-- SECTION 4: ENHANCE AUDIT LOGS
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS previous_value jsonb,
  ADD COLUMN IF NOT EXISTS new_value jsonb,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS ip_address text;

-- SECTION 8: USER DEVICES TABLE
CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  device_name text,
  last_login timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_unique ON public.user_devices(user_id, device_id);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own devices"
  ON public.user_devices FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin view all devices"
  ON public.user_devices FOR SELECT
  USING (is_admin());

CREATE OR REPLACE FUNCTION public.enforce_device_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  SELECT count(*) INTO active_count
  FROM public.user_devices
  WHERE user_id = NEW.user_id AND is_active = true;

  IF active_count >= 2 THEN
    UPDATE public.user_devices
    SET is_active = false
    WHERE id = (
      SELECT id FROM public.user_devices
      WHERE user_id = NEW.user_id AND is_active = true
      ORDER BY last_login ASC
      LIMIT 1
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_device_limit
  BEFORE INSERT ON public.user_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_device_limit();

-- SECTION 9: DAILY FINANCIAL SUMMARY
CREATE TABLE IF NOT EXISTS public.daily_financial_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date date NOT NULL UNIQUE,
  total_collection numeric(18,2) NOT NULL DEFAULT 0,
  total_penalty numeric(18,2) NOT NULL DEFAULT 0,
  total_disbursement numeric(18,2) NOT NULL DEFAULT 0,
  total_savings_deposit numeric(18,2) NOT NULL DEFAULT 0,
  total_savings_withdrawal numeric(18,2) NOT NULL DEFAULT 0,
  total_interest_collected numeric(18,2) NOT NULL DEFAULT 0,
  total_transactions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON public.daily_financial_summary(summary_date DESC);

ALTER TABLE public.daily_financial_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin_owner read daily_summary"
  ON public.daily_financial_summary FOR SELECT
  USING (is_admin_or_owner());

CREATE POLICY "Admin_owner manage daily_summary"
  ON public.daily_financial_summary FOR ALL
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Treasurer read daily_summary"
  ON public.daily_financial_summary FOR SELECT
  USING (is_treasurer());

CREATE OR REPLACE FUNCTION public.populate_daily_summary(_target_date date DEFAULT CURRENT_DATE - 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_collection numeric := 0;
  v_penalty numeric := 0;
  v_disbursement numeric := 0;
  v_savings_dep numeric := 0;
  v_savings_wd numeric := 0;
  v_interest numeric := 0;
  v_tx_count integer := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN reference_type = 'loan_repayment' AND entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reference_type IN ('penalty', 'loan_penalty') AND entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reference_type = 'loan_disbursement' AND entry_type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reference_type = 'savings_deposit' AND entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reference_type = 'savings_withdrawal' AND entry_type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN reference_type IN ('loan_interest', 'loan_repayment') AND entry_type = 'credit'
      AND account_type = 'income' THEN amount ELSE 0 END), 0),
    COUNT(DISTINCT transaction_group_id)
  INTO v_collection, v_penalty, v_disbursement, v_savings_dep, v_savings_wd, v_interest, v_tx_count
  FROM public.ledger_entries
  WHERE created_at::date = _target_date
    AND is_reversal = false;

  INSERT INTO public.daily_financial_summary (
    summary_date, total_collection, total_penalty, total_disbursement,
    total_savings_deposit, total_savings_withdrawal, total_interest_collected,
    total_transactions, updated_at
  ) VALUES (
    _target_date, v_collection, v_penalty, v_disbursement,
    v_savings_dep, v_savings_wd, v_interest, v_tx_count, now()
  )
  ON CONFLICT (summary_date) DO UPDATE SET
    total_collection = EXCLUDED.total_collection,
    total_penalty = EXCLUDED.total_penalty,
    total_disbursement = EXCLUDED.total_disbursement,
    total_savings_deposit = EXCLUDED.total_savings_deposit,
    total_savings_withdrawal = EXCLUDED.total_savings_withdrawal,
    total_interest_collected = EXCLUDED.total_interest_collected,
    total_transactions = EXCLUDED.total_transactions,
    updated_at = now();

  SELECT json_build_object(
    'date', _target_date,
    'collection', v_collection,
    'penalty', v_penalty,
    'disbursement', v_disbursement,
    'savings_deposit', v_savings_dep,
    'savings_withdrawal', v_savings_wd,
    'interest', v_interest,
    'transactions', v_tx_count
  ) INTO result;

  RETURN result;
END;
$$;

-- SECTION 6: SERVER TIME FUNCTION
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'server_time', now(),
    'timezone', current_setting('TIMEZONE'),
    'server_date', CURRENT_DATE
  );
$$;

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON public.ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference_type ON public.ledger_entries(reference_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_group_id ON public.ledger_entries(transaction_group_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON public.audit_logs(user_id, action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Feature flag audit trigger
CREATE OR REPLACE FUNCTION public.audit_feature_flag_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    action_type, entity_type, entity_id, user_id,
    previous_value, new_value
  ) VALUES (
    'feature_flag_change', 'feature_flags', NEW.id, auth.uid(),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_feature_flag
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_feature_flag_change();
