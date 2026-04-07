
-- System health check results log
CREATE TABLE public.system_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','warn','fail')),
  latency_ms integer,
  detail text,
  overall_status text NOT NULL CHECK (overall_status IN ('healthy','degraded','unhealthy')),
  total_latency_ms integer,
  tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-fix action audit trail
CREATE TABLE public.auto_fix_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name text NOT NULL,
  triggered_by_check text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  execution_ms integer,
  tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_health_logs_created ON public.system_health_logs (created_at DESC);
CREATE INDEX idx_health_logs_run ON public.system_health_logs (run_id);
CREATE INDEX idx_health_logs_status ON public.system_health_logs (status) WHERE status != 'pass';
CREATE INDEX idx_auto_fix_created ON public.auto_fix_logs (created_at DESC);
CREATE INDEX idx_auto_fix_check ON public.auto_fix_logs (triggered_by_check);

-- Enable RLS
ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_fix_logs ENABLE ROW LEVEL SECURITY;

-- Admin/owner read-only access
CREATE POLICY "admin_read_health_logs" ON public.system_health_logs
  FOR SELECT TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "admin_read_auto_fix_logs" ON public.auto_fix_logs
  FOR SELECT TO authenticated
  USING (is_admin_or_owner());

-- Block all direct DML from authenticated users (writes come from service role only)
CREATE POLICY "block_insert_health_logs" ON public.system_health_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "block_update_health_logs" ON public.system_health_logs
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "block_delete_health_logs" ON public.system_health_logs
  FOR DELETE TO authenticated
  USING (false);

CREATE POLICY "block_insert_auto_fix_logs" ON public.auto_fix_logs
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "block_update_auto_fix_logs" ON public.auto_fix_logs
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "block_delete_auto_fix_logs" ON public.auto_fix_logs
  FOR DELETE TO authenticated
  USING (false);

-- Enable realtime for dashboard live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_health_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auto_fix_logs;
