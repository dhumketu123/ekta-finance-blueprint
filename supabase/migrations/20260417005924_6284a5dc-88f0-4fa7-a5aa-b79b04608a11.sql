
-- ============================================================
-- PHASE 2: Dashboard Summary V2 RPC (consolidates 22 → 1 query)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_summary_v2(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_tenant_clients uuid[];
  v_tenant_loans uuid[];
BEGIN
  PERFORM 1 FROM profiles WHERE id = auth.uid() AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: user does not belong to tenant';
  END IF;

  SELECT array_agg(id) INTO v_tenant_clients
  FROM clients WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT array_agg(id) INTO v_tenant_loans
  FROM loans WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  WITH
    client_stats AS (
      SELECT
        COUNT(*)                                          AS total_clients,
        COUNT(*) FILTER (WHERE status = 'active' AND COALESCE(loan_amount,0) > 0) AS active_loan_clients,
        COALESCE(SUM(loan_amount) FILTER (WHERE status='active'), 0) AS total_loan_amount,
        COUNT(*) FILTER (WHERE status = 'overdue')        AS overdue_count,
        COUNT(*) FILTER (WHERE status = 'pending')        AS pending_count
      FROM clients
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    ),
    investor_stats AS (
      SELECT
        COUNT(*)                                                    AS investor_count,
        COUNT(*) FILTER (WHERE status='active')                     AS active_investor_count,
        COUNT(*) FILTER (WHERE reinvest)                            AS reinvestor_count,
        COALESCE(SUM(capital), 0)                                   AS total_capital,
        COALESCE(SUM(principal_amount), 0)                          AS total_principal_invested,
        COALESCE(SUM(accumulated_profit), 0)                        AS total_accumulated_profit
      FROM investors
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    ),
    loan_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')   AS active_loans,
        COUNT(*) FILTER (WHERE status = 'default')  AS default_loans
      FROM loans
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
    ),
    schedule_stats AS (
      SELECT
        COUNT(*)                                  AS total_schedules,
        COUNT(*) FILTER (WHERE status='overdue')  AS overdue_schedules
      FROM loan_schedules
      WHERE loan_id = ANY(v_tenant_loans)
    ),
    risk_stats AS (
      SELECT COUNT(*) AS risk_clients
      FROM credit_scores
      WHERE client_id = ANY(v_tenant_clients) AND score < 40
    ),
    month_tx AS (
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type='savings_deposit'  AND status='paid'), 0) AS savings_this_month,
        COALESCE(SUM(amount) FILTER (WHERE type='investor_profit'),                    0) AS profit_this_month
      FROM transactions
      WHERE client_id = ANY(v_tenant_clients)
        AND deleted_at IS NULL
        AND transaction_date >= date_trunc('month', CURRENT_DATE)
    ),
    profit_total AS (
      SELECT COALESCE(SUM(amount), 0) AS total_profit_distributed
      FROM transactions
      WHERE deleted_at IS NULL
        AND type='investor_profit' AND status='paid'
        AND (client_id = ANY(v_tenant_clients) OR investor_id IN (
          SELECT id FROM investors WHERE tenant_id = p_tenant_id
        ))
    ),
    monthly_repayment AS (
      SELECT json_agg(row_to_json(t) ORDER BY t.month) AS series
      FROM (
        SELECT to_char(created_at, 'YYYY-MM') AS month,
               SUM(amount)::numeric           AS amount
        FROM transactions
        WHERE deleted_at IS NULL
          AND type = 'loan_repayment'
          AND client_id = ANY(v_tenant_clients)
          AND created_at >= (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY 1
      ) t
    )
  SELECT jsonb_build_object(
    'total_clients',              cs.total_clients,
    'active_loans_count',         cs.active_loan_clients,
    'total_loan_amount',          cs.total_loan_amount,
    'overdue_count',              cs.overdue_count,
    'pending_count',              cs.pending_count,
    'investor_count',             ist.investor_count,
    'active_investor_count',      ist.active_investor_count,
    'reinvestor_count',           ist.reinvestor_count,
    'total_capital',              ist.total_capital,
    'total_principal_invested',   ist.total_principal_invested,
    'total_accumulated_profit',   ist.total_accumulated_profit,
    'active_loans',               ls.active_loans,
    'default_loans',              ls.default_loans,
    'total_schedules',            ss.total_schedules,
    'overdue_schedules',          ss.overdue_schedules,
    'risk_clients',               rs.risk_clients,
    'savings_this_month',         mt.savings_this_month,
    'profit_this_month',          mt.profit_this_month,
    'total_profit_distributed',   pt.total_profit_distributed,
    'monthly_repayment',          COALESCE(mr.series, '[]'::json)
  ) INTO v_result
  FROM client_stats cs, investor_stats ist, loan_stats ls,
       schedule_stats ss, risk_stats rs, month_tx mt,
       profit_total pt, monthly_repayment mr;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_summary_v2(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary_v2(uuid) TO authenticated;

-- ============================================================
-- MAKER-CHECKER: approval_requests table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount numeric,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXECUTED','EXECUTION_FAILED')),
  maker_id uuid NOT NULL REFERENCES auth.users(id),
  checker_id uuid REFERENCES auth.users(id),
  rejection_reason text,
  execution_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  executed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_maker_not_checker CHECK (checker_id IS NULL OR checker_id <> maker_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_status ON public.approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_maker ON public.approval_requests(maker_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending ON public.approval_requests(tenant_id, created_at DESC) WHERE status = 'PENDING';

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_requests_select_tenant"
ON public.approval_requests FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "approval_requests_insert_self"
ON public.approval_requests FOR INSERT
TO authenticated
WITH CHECK (
  maker_id = auth.uid()
  AND tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "approval_requests_update_checker"
ON public.approval_requests FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  AND maker_id <> auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  )
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  AND maker_id <> auth.uid()
);

CREATE POLICY "approval_requests_cancel_own"
ON public.approval_requests FOR UPDATE
TO authenticated
USING (maker_id = auth.uid() AND status = 'PENDING')
WITH CHECK (maker_id = auth.uid() AND status IN ('PENDING','CANCELLED'));

CREATE TRIGGER trg_approval_requests_updated_at
BEFORE UPDATE ON public.approval_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Maker-Checker helper RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_approval_request(
  p_entity_type text,
  p_action_type text,
  p_payload jsonb,
  p_entity_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT tenant_id INTO v_tenant FROM profiles WHERE id = auth.uid();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant for user'; END IF;

  INSERT INTO approval_requests (tenant_id, entity_type, entity_id, action_type, payload, amount, maker_id)
  VALUES (v_tenant, p_entity_type, p_entity_id, p_action_type, COALESCE(p_payload,'{}'::jsonb), p_amount, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (entity_type, entity_id, action_type, user_id, new_value)
  VALUES ('approval_request', v_id, 'created', auth.uid(),
          jsonb_build_object('entity_type', p_entity_type, 'action_type', p_action_type, 'amount', p_amount));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_approval_request(
  p_request_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Invalid decision'; END IF;

  SELECT * INTO v_req FROM approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval request not found'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'Request already %', v_req.status; END IF;
  IF v_req.maker_id = auth.uid() THEN RAISE EXCEPTION 'Maker cannot approve own request'; END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'owner'::app_role);
  IF NOT v_is_admin THEN RAISE EXCEPTION 'Insufficient role for approval decision'; END IF;

  UPDATE approval_requests
     SET status = p_decision,
         checker_id = auth.uid(),
         approved_at = CASE WHEN p_decision='APPROVED' THEN now() ELSE approved_at END,
         rejection_reason = CASE WHEN p_decision='REJECTED' THEN p_reason ELSE NULL END
   WHERE id = p_request_id;

  INSERT INTO audit_logs (entity_type, entity_id, action_type, user_id, new_value)
  VALUES ('approval_request', p_request_id, lower(p_decision), auth.uid(),
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('id', p_request_id, 'status', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.create_approval_request(text,text,jsonb,uuid,numeric) FROM public;
REVOKE ALL ON FUNCTION public.decide_approval_request(uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_approval_request(text,text,jsonb,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_approval_request(uuid,text,text) TO authenticated;
