-- ============================================================
-- STEP 1: FOUNDATION (REGISTRY + STUB CORE)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.execution_registry (
  entity_type TEXT PRIMARY KEY,
  executor_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  permission_role TEXT DEFAULT 'authenticated',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed registry (safe mapping)
INSERT INTO public.execution_registry(entity_type, executor_name)
VALUES
('loan_disbursement', 'execute_loan_disbursement'),
('loan_reschedule', 'execute_stub_not_ready'),
('early_settlement', 'execute_stub_not_ready'),
('profit_distribution', 'execute_stub_not_ready'),
('owner_exit', 'execute_stub_not_ready'),
('journal_adjustment', 'execute_stub_not_ready')
ON CONFLICT (entity_type) DO NOTHING;

-- Drop previous two-argument variant if it exists (signature change)
DROP FUNCTION IF EXISTS public.execute_stub_not_ready(uuid, text);

-- Controlled stub executor (safe failure)
CREATE OR REPLACE FUNCTION public.execute_stub_not_ready(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT entity_type INTO v_type
  FROM public.approval_requests
  WHERE id = p_request_id;

  UPDATE public.approval_requests
  SET status = 'EXECUTION_FAILED',
      execution_error = 'NOT_IMPLEMENTED:' || COALESCE(v_type,'unknown'),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.approval_execution_logs(request_id, success, error_message)
  VALUES (p_request_id, false, 'stub_not_ready');
END;
$$;

REVOKE ALL ON FUNCTION public.execute_stub_not_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_stub_not_ready(uuid) TO authenticated;