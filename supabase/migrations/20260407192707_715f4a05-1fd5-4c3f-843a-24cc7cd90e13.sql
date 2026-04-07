
-- Knowledge Graph Nodes
CREATE TABLE public.system_knowledge_graph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  node_type text NOT NULL, -- 'table','trigger','function','rls_policy','edge_function','component','hook','business_rule','kpi','sop'
  node_key text NOT NULL,
  node_label text NOT NULL,
  category text NOT NULL DEFAULT 'schema',
  metadata jsonb NOT NULL DEFAULT '{}',
  relationships jsonb NOT NULL DEFAULT '[]', -- [{target_key, relation_type, weight}]
  criticality integer NOT NULL DEFAULT 5, -- 1-10
  embedding_version integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, node_type, node_key)
);

ALTER TABLE public.system_knowledge_graph ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_manage_knowledge_graph"
ON public.system_knowledge_graph FOR ALL
TO authenticated
USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id())
WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

-- Sync Log (append-only)
CREATE TABLE public.knowledge_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  sync_type text NOT NULL DEFAULT 'full', -- 'full','incremental','schema','code','metrics'
  status text NOT NULL DEFAULT 'running', -- 'running','completed','failed'
  nodes_processed integer NOT NULL DEFAULT 0,
  nodes_created integer NOT NULL DEFAULT 0,
  nodes_updated integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_sync_log"
ON public.knowledge_sync_log FOR SELECT
TO authenticated
USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "admin_owner_insert_sync_log"
ON public.knowledge_sync_log FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

-- Indexes
CREATE INDEX idx_knowledge_graph_type ON public.system_knowledge_graph(tenant_id, node_type);
CREATE INDEX idx_knowledge_graph_category ON public.system_knowledge_graph(tenant_id, category);
CREATE INDEX idx_sync_log_tenant ON public.knowledge_sync_log(tenant_id, started_at DESC);
