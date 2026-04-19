-- ============================================================================
-- MANAGER ROLE — READ-ONLY RLS COVERAGE (ADDITIVE ONLY)
-- ----------------------------------------------------------------------------
-- Frontend ROLE_PERMISSIONS grants manager: VIEW_DASHBOARD, VIEW_CLIENTS,
-- VIEW_REPORTS. Backend had zero policies referencing 'manager', causing
-- silent empty-data results. This migration ONLY ADDS SELECT policies.
-- No existing policy is altered or dropped. Tenant isolation, ledger
-- immutability, and approval engine behavior are untouched.
-- ============================================================================

-- Operational entities ------------------------------------------------------
CREATE POLICY "Manager view clients"
  ON public.clients FOR SELECT
  USING (public.has_role(auth.uid(), 'manager') AND deleted_at IS NULL);

CREATE POLICY "Manager view loans"
  ON public.loans FOR SELECT
  USING (public.has_role(auth.uid(), 'manager') AND deleted_at IS NULL);

CREATE POLICY "Manager view savings_accounts"
  ON public.savings_accounts FOR SELECT
  USING (public.has_role(auth.uid(), 'manager') AND deleted_at IS NULL);

CREATE POLICY "Manager view commitments"
  ON public.commitments FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Manager view credit_scores"
  ON public.credit_scores FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Manager view client_risk"
  ON public.client_risk FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Manager view communication_logs"
  ON public.communication_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

-- Reporting / aggregate read-only views -------------------------------------
CREATE POLICY "Manager view financial_transactions"
  ON public.financial_transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Manager view daily_financial_summary"
  ON public.daily_financial_summary FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Manager view executive_reports"
  ON public.executive_reports FOR SELECT
  USING (public.has_role(auth.uid(), 'manager'));
