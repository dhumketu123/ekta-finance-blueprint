
ALTER TABLE public.ai_insights
ADD COLUMN IF NOT EXISTS execution_priority integer;

CREATE INDEX IF NOT EXISTS idx_ai_insights_priority
ON public.ai_insights (execution_priority DESC)
WHERE status = 'active';
