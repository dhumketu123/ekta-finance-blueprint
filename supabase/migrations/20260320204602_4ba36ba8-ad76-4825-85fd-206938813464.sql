
CREATE OR REPLACE FUNCTION public.get_dashboard_summary_metrics(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_total_clients BIGINT;
  v_active_loans BIGINT;
  v_total_capital BIGINT;
  v_total_interest BIGINT;
  v_overdue_loans BIGINT;
  v_result JSONB;
BEGIN
  PERFORM 1 FROM profiles WHERE id = auth.uid() AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to tenant';
  END IF;

  SELECT COUNT(*) INTO v_total_clients FROM clients WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO v_active_loans FROM loans WHERE tenant_id = p_tenant_id AND status = 'active';
  SELECT COALESCE(SUM(capital), 0) INTO v_total_capital FROM investors WHERE tenant_id = p_tenant_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_total_interest 
  FROM financial_transactions ft
  JOIN clients c ON ft.member_id = c.id
  WHERE c.tenant_id = p_tenant_id AND ft.transaction_type = 'loan_interest_payment';
  SELECT COUNT(*) INTO v_overdue_loans FROM loans WHERE tenant_id = p_tenant_id AND status = 'overdue';

  v_result := jsonb_build_object(
    'total_clients', v_total_clients,
    'active_loans', v_active_loans,
    'total_capital_invested', v_total_capital,
    'total_interest_earned', v_total_interest,
    'overdue_loans', v_overdue_loans
  );

  RETURN v_result;
END;
$$;
