
-- ═══════════════════════════════════════════════════════════
-- Phase 2.5: Commitment Analytics & Telemetry Table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE public.commitment_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commitment_id UUID REFERENCES public.commitments(id),
  action_type TEXT NOT NULL, -- 'swipe_fulfill', 'swipe_reschedule', 'ai_chip_select', 'reschedule_confirm'
  action_metadata JSONB DEFAULT '{}'::jsonb,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast querying
CREATE INDEX idx_commitment_analytics_user ON public.commitment_analytics(user_id);
CREATE INDEX idx_commitment_analytics_action ON public.commitment_analytics(action_type);
CREATE INDEX idx_commitment_analytics_created ON public.commitment_analytics(created_at DESC);

-- Enable RLS
ALTER TABLE public.commitment_analytics ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/Owner full access
CREATE POLICY "Admin/owner full access commitment_analytics"
  ON public.commitment_analytics
  AS RESTRICTIVE
  FOR ALL
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

-- RLS: Users can insert own analytics
CREATE POLICY "Users insert own commitment_analytics"
  ON public.commitment_analytics
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Field officers view own analytics
CREATE POLICY "Field officers view own commitment_analytics"
  ON public.commitment_analytics
  AS RESTRICTIVE
  FOR SELECT
  USING (is_field_officer() AND user_id = auth.uid());

-- RLS: Treasurer view all analytics
CREATE POLICY "Treasurer view commitment_analytics"
  ON public.commitment_analytics
  AS RESTRICTIVE
  FOR SELECT
  USING (is_treasurer());
