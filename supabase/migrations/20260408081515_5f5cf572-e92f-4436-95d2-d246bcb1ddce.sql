
-- Step 1: Create system_dna table
CREATE TABLE public.system_dna (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  entity_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT system_dna_unique_entity UNIQUE (category, entity_name)
);

-- Indexes
CREATE INDEX idx_system_dna_category ON public.system_dna (category);
CREATE INDEX idx_system_dna_entity_name ON public.system_dna (entity_name);

-- Enable RLS
ALTER TABLE public.system_dna ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/owner read only
CREATE POLICY "admin_owner_read_system_dna"
  ON public.system_dna FOR SELECT
  TO authenticated
  USING (is_admin_or_owner());

-- RLS: Block all DML from authenticated users (service role bypasses RLS)
CREATE POLICY "block_insert_system_dna"
  ON public.system_dna FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "block_update_system_dna"
  ON public.system_dna FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "block_delete_system_dna"
  ON public.system_dna FOR DELETE
  TO authenticated
  USING (false);

-- Block anon
CREATE POLICY "deny_anon_system_dna"
  ON public.system_dna FOR SELECT
  TO anon
  USING (false);

-- Updated_at trigger
CREATE TRIGGER update_system_dna_updated_at
  BEFORE UPDATE ON public.system_dna
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 5: AI System Overview View
CREATE OR REPLACE VIEW public.ai_system_overview AS
SELECT
  (SELECT count(*) FROM public.system_dna WHERE category = 'database_table') AS total_tables_indexed,
  (SELECT count(*) FROM public.system_dna WHERE category = 'edge_function') AS total_edge_functions_indexed,
  (SELECT count(*) FROM public.system_dna WHERE category = 'business_rule') AS total_business_rules_indexed,
  (SELECT count(*) FROM public.system_dna WHERE category = 'feature_flag') AS total_feature_flags_indexed,
  (SELECT count(*) FROM public.feature_flags WHERE is_enabled = true) AS active_feature_flags,
  (SELECT count(*) FROM public.loans WHERE deleted_at IS NULL) AS total_loans,
  (SELECT count(*) FROM public.loans WHERE status = 'active' AND deleted_at IS NULL) AS active_loans,
  (SELECT count(*) FROM public.loans WHERE status = 'default' AND deleted_at IS NULL) AS defaulted_loans,
  (SELECT count(*) FROM public.notification_logs WHERE created_at > now() - interval '7 days') AS notifications_7d,
  (SELECT count(*) FROM public.notification_logs WHERE delivery_status = 'failed' AND created_at > now() - interval '7 days') AS failed_notifications_7d,
  now() AS generated_at;
