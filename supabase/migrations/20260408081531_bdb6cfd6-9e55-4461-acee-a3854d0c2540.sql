
DROP VIEW IF EXISTS public.ai_system_overview;

CREATE VIEW public.ai_system_overview
WITH (security_invoker = true)
AS
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
