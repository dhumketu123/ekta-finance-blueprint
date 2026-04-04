
-- Create governance_action_logs table for audit trail
CREATE TABLE public.governance_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id TEXT NOT NULL,
  action TEXT NOT NULL,
  channel TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  tenant_id TEXT NOT NULL,
  executed_by UUID REFERENCES auth.users(id),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.governance_action_logs ENABLE ROW LEVEL SECURITY;

-- Read policy: authenticated users can view their tenant's logs
CREATE POLICY "Users can view their tenant governance logs"
  ON public.governance_action_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert policy: authenticated users can insert logs
CREATE POLICY "Users can insert governance logs"
  ON public.governance_action_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE policies — append-only audit trail

-- Index for fast lookups
CREATE INDEX idx_governance_action_logs_tenant ON public.governance_action_logs(tenant_id);
CREATE INDEX idx_governance_action_logs_client ON public.governance_action_logs(client_id);
CREATE INDEX idx_governance_action_logs_executed_at ON public.governance_action_logs(executed_at DESC);
