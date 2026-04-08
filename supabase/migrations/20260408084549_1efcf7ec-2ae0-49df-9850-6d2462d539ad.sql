
-- AI Assistant Knowledge table
CREATE TABLE IF NOT EXISTS public.ai_assistant_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_category text NOT NULL,
  entity_name text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_knowledge_entity
  ON public.ai_assistant_knowledge (entity_category, entity_name);

ALTER TABLE public.ai_assistant_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_ai_knowledge"
  ON public.ai_assistant_knowledge FOR SELECT
  TO authenticated
  USING (is_admin_or_owner());

CREATE POLICY "service_role_all_ai_knowledge"
  ON public.ai_assistant_knowledge FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "block_anon_ai_knowledge"
  ON public.ai_assistant_knowledge FOR SELECT
  TO anon
  USING (false);

-- Merged view for AI context
CREATE OR REPLACE VIEW public.ai_assistant_overview
WITH (security_invoker = true)
AS
SELECT
  dna.category AS entity_category,
  dna.entity_name,
  dna.description,
  dna.metadata,
  k.metadata AS knowledge_metadata,
  dna.version,
  dna.is_active,
  dna.criticality_score,
  now() AS generated_at
FROM public.system_dna dna
LEFT JOIN public.ai_assistant_knowledge k
  ON dna.category = k.entity_category AND dna.entity_name = k.entity_name
WHERE dna.is_deleted = false;

-- RPC for AI queries
CREATE OR REPLACE FUNCTION public.fn_fetch_ai_knowledge()
RETURNS TABLE (
  entity_category text,
  entity_name text,
  description text,
  metadata jsonb,
  knowledge_metadata jsonb,
  version integer,
  is_active boolean,
  criticality_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT entity_category, entity_name, description, metadata, knowledge_metadata, version, is_active, criticality_score
  FROM public.ai_assistant_overview;
$$;
