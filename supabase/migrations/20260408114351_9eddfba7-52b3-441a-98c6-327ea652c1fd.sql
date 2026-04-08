
-- Rename column
ALTER TABLE public.ai_insights RENAME COLUMN execution_priority TO priority_score;

-- Drop old index
DROP INDEX IF EXISTS idx_ai_insights_priority;

-- Auto-calculate trigger
CREATE OR REPLACE FUNCTION public.calculate_priority_score()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.priority_score :=
      COALESCE(NEW.severity_score,0)
    + CASE WHEN NEW.metadata->>'circular' = 'true' THEN 2 ELSE 0 END
    + CASE WHEN NEW.insight_type = 'dependency_warning' THEN 1 ELSE 0 END
    + CASE 
        WHEN (NEW.metadata->>'criticality') ~ '^[0-9]+$'
             AND (NEW.metadata->>'criticality')::int >= 5
        THEN 2 
        ELSE 0 
      END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_priority_score ON public.ai_insights;

CREATE TRIGGER trg_calculate_priority_score
BEFORE INSERT OR UPDATE OF severity_score, metadata, insight_type
ON public.ai_insights
FOR EACH ROW
WHEN (NEW.status = 'active')
EXECUTE FUNCTION public.calculate_priority_score();

-- Performance index
CREATE INDEX IF NOT EXISTS idx_ai_insights_priority_active
ON public.ai_insights (priority_score DESC)
WHERE status = 'active';
