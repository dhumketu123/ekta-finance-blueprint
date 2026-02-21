
-- Add retry_count column to notification_logs
ALTER TABLE public.notification_logs
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- Performance indexes for notification_logs (critical for 10K-50K scale)
CREATE INDEX IF NOT EXISTS idx_notification_logs_delivery_status 
ON public.notification_logs (delivery_status);

CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at 
ON public.notification_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_event_type 
ON public.notification_logs (event_type);

CREATE INDEX IF NOT EXISTS idx_notification_logs_client_id 
ON public.notification_logs (client_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_loan_id 
ON public.notification_logs (loan_id);

-- Composite index for common filter pattern
CREATE INDEX IF NOT EXISTS idx_notification_logs_status_created 
ON public.notification_logs (delivery_status, created_at DESC);
