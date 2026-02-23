
-- =============================================
-- SMART SNOOZE: Add promise/snooze fields to loan_schedules
-- =============================================
ALTER TABLE public.loan_schedules
  ADD COLUMN IF NOT EXISTS promised_date date,
  ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promised_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_penalty_frozen boolean NOT NULL DEFAULT false;

-- Index for ghost penalty cron
CREATE INDEX IF NOT EXISTS idx_loan_schedules_promised
  ON public.loan_schedules (promised_date, promised_status)
  WHERE promised_status = 'promised';

-- =============================================
-- COMMUNICATION HUB: communication_logs table
-- =============================================
CREATE TABLE IF NOT EXISTS public.communication_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  loan_id uuid REFERENCES public.loans(id),
  comm_type text NOT NULL CHECK (comm_type IN ('call', 'whatsapp', 'sms')),
  template_used text,
  message_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/Owner full access
CREATE POLICY "Admin_owner_full_access_communication_logs"
  ON public.communication_logs FOR ALL
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

-- RLS: Users manage own logs
CREATE POLICY "Users_manage_own_communication_logs"
  ON public.communication_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users_view_own_communication_logs"
  ON public.communication_logs FOR SELECT
  USING (user_id = auth.uid());

-- RLS: Treasurer read
CREATE POLICY "Treasurer_view_communication_logs"
  ON public.communication_logs FOR SELECT
  USING (is_treasurer());

-- =============================================
-- RPC: Snooze a loan schedule installment
-- =============================================
CREATE OR REPLACE FUNCTION public.snooze_installment(
  p_schedule_id uuid,
  p_promised_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule loan_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM loan_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Installment not found');
  END IF;

  IF v_schedule.status = 'paid' THEN
    RETURN jsonb_build_object('error', 'Already paid');
  END IF;

  IF p_promised_date <= CURRENT_DATE THEN
    RETURN jsonb_build_object('error', 'Promise date must be in the future');
  END IF;

  IF v_schedule.snooze_count >= 3 THEN
    RETURN jsonb_build_object('error', 'Maximum snooze limit (3) reached');
  END IF;

  UPDATE loan_schedules
  SET
    promised_date = p_promised_date,
    snooze_count = snooze_count + 1,
    promised_status = 'promised',
    is_penalty_frozen = true,
    updated_at = now()
  WHERE id = p_schedule_id;

  RETURN jsonb_build_object(
    'success', true,
    'snooze_count', v_schedule.snooze_count + 1,
    'promised_date', p_promised_date
  );
END;
$$;

-- =============================================
-- RPC: Ghost Penalty — unfreeze expired promises
-- =============================================
CREATE OR REPLACE FUNCTION public.process_ghost_penalties()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE loan_schedules
  SET
    is_penalty_frozen = false,
    promised_status = 'broken',
    status = 'overdue',
    updated_at = now()
  WHERE
    promised_status = 'promised'
    AND promised_date < CURRENT_DATE
    AND status != 'paid';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'processed', v_count,
    'run_at', now()
  );
END;
$$;
