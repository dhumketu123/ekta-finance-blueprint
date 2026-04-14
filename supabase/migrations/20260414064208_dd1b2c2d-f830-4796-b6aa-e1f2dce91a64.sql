
-- =============================================
-- 1. High-performance tenant resolver for RLS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- =============================================
-- 2. Dead Letter Queue for knowledge sync
-- =============================================
CREATE TABLE IF NOT EXISTS public.knowledge_sync_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  node_key text NOT NULL,
  node_type text NOT NULL DEFAULT 'unknown',
  error_message text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_retry_at timestamptz,
  resolved_at timestamptz
);

ALTER TABLE public.knowledge_sync_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view DLQ"
  ON public.knowledge_sync_dlq FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service can manage DLQ"
  ON public.knowledge_sync_dlq FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dlq_unresolved
  ON public.knowledge_sync_dlq (resolved, created_at)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_dlq_node_key
  ON public.knowledge_sync_dlq (node_key);
