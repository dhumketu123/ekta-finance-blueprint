
-- Phase 7: notification_logs table for deduplication and audit
CREATE TABLE public.notification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id uuid REFERENCES public.loans(id),
  client_id uuid REFERENCES public.clients(id),
  event_type text NOT NULL,
  installment_number integer,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  channel text NOT NULL DEFAULT 'sms',
  message_bn text NOT NULL DEFAULT '',
  message_en text NOT NULL DEFAULT '',
  recipient_phone text,
  recipient_name text,
  delivery_status text NOT NULL DEFAULT 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplication: prevent duplicate messages for same loan+event+installment+day
CREATE UNIQUE INDEX idx_notif_dedup 
  ON public.notification_logs(loan_id, event_type, installment_number, event_date);

-- RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access notification_logs"
  ON public.notification_logs FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Treasurer view notification_logs"
  ON public.notification_logs FOR SELECT
  USING (public.is_treasurer());

-- Performance indexes
CREATE INDEX idx_notification_logs_client ON public.notification_logs(client_id, created_at);
