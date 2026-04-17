CREATE TABLE IF NOT EXISTS public.execution_lock (
  request_id uuid PRIMARY KEY,
  locked_at timestamptz DEFAULT now()
);

ALTER TABLE public.execution_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_lock_admin_select"
ON public.execution_lock
FOR SELECT
TO authenticated
USING (public.is_privileged_user());

CREATE TABLE IF NOT EXISTS public.execution_audit_log (
  id bigserial PRIMARY KEY,
  request_id uuid,
  entity_type text,
  action_type text,
  success boolean,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.execution_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_audit_log_admin_select"
ON public.execution_audit_log
FOR SELECT
TO authenticated
USING (public.is_privileged_user());

CREATE INDEX IF NOT EXISTS idx_execution_audit_log_request_id
  ON public.execution_audit_log(request_id);

CREATE INDEX IF NOT EXISTS idx_execution_audit_log_created_at
  ON public.execution_audit_log(created_at DESC);