
CREATE TABLE public.daily_user_close (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  close_date date NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  total_collection numeric NOT NULL DEFAULT 0,
  total_expense numeric NOT NULL DEFAULT 0,
  internal_transfer numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  declared_cash numeric,
  variance numeric,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  closed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, close_date, tenant_id)
);

CREATE TABLE public.reopen_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_id uuid NOT NULL REFERENCES public.daily_user_close(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_duc_tenant ON public.daily_user_close(tenant_id);
CREATE INDEX idx_duc_user_date ON public.daily_user_close(user_id, close_date);
CREATE INDEX idx_rr_close ON public.reopen_requests(close_id);
CREATE INDEX idx_rr_tenant ON public.reopen_requests(tenant_id);

ALTER TABLE public.daily_user_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reopen_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sel_own_duc" ON public.daily_user_close FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_owner());
CREATE POLICY "ins_own_duc" ON public.daily_user_close FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_user_tenant_id());
CREATE POLICY "upd_admin_duc" ON public.daily_user_close FOR UPDATE TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());
CREATE POLICY "upd_own_duc" ON public.daily_user_close FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'open' AND tenant_id = get_user_tenant_id());
CREATE POLICY "ti_duc" ON public.daily_user_close AS RESTRICTIVE FOR ALL TO authenticated
  USING ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()))
  WITH CHECK ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()));

CREATE POLICY "sel_own_rr" ON public.reopen_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR is_admin_or_owner());
CREATE POLICY "ins_own_rr" ON public.reopen_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND tenant_id = get_user_tenant_id());
CREATE POLICY "upd_admin_rr" ON public.reopen_requests FOR UPDATE TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());
CREATE POLICY "ti_rr" ON public.reopen_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()))
  WITH CHECK ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()));

CREATE OR REPLACE FUNCTION public.get_day_close_summary(p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_tid uuid := get_user_tenant_id();
  v_op numeric := 0; v_col numeric := 0; v_exp numeric := 0; v_xfr numeric := 0;
  v_res jsonb; v_ex record;
BEGIN
  SELECT * INTO v_ex FROM daily_user_close WHERE user_id=v_uid AND close_date=p_date AND tenant_id=v_tid;
  SELECT COALESCE(declared_cash,expected_cash,0) INTO v_op FROM daily_user_close
    WHERE user_id=v_uid AND tenant_id=v_tid AND close_date<p_date AND status IN ('closed','reopened')
    ORDER BY close_date DESC LIMIT 1;
  v_op := COALESCE(v_op,0);
  SELECT COALESCE(SUM(amount),0) INTO v_col FROM financial_transactions
    WHERE created_by=v_uid AND created_at::date=p_date AND approval_status='approved'
    AND transaction_type IN ('loan_repayment','savings_deposit','penalty_collection');
  SELECT COALESCE(SUM(amount),0) INTO v_exp FROM financial_transactions
    WHERE created_by=v_uid AND created_at::date=p_date AND approval_status='approved'
    AND transaction_type IN ('loan_disbursement','savings_withdrawal','expense');
  SELECT COALESCE(SUM(amount),0) INTO v_xfr FROM financial_transactions
    WHERE created_by=v_uid AND created_at::date=p_date AND approval_status='approved'
    AND transaction_type='internal_transfer';
  v_res := jsonb_build_object('opening_balance',v_op,'total_collection',v_col,'total_expense',v_exp,
    'internal_transfer',v_xfr,'expected_cash',v_op+v_col-v_exp-v_xfr,
    'existing_close', CASE WHEN v_ex.id IS NOT NULL THEN jsonb_build_object(
      'id',v_ex.id,'status',v_ex.status,'declared_cash',v_ex.declared_cash,
      'variance',v_ex.variance,'note',v_ex.note,'closed_at',v_ex.closed_at) ELSE NULL END);
  RETURN v_res;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_day_close(p_date date, p_declared_cash numeric, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_tid uuid := get_user_tenant_id();
  v_s jsonb; v_e numeric; v_v numeric; v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM daily_user_close WHERE user_id=v_uid AND close_date=p_date AND tenant_id=v_tid AND status='closed') THEN
    RETURN jsonb_build_object('status','error','message','Day already closed');
  END IF;
  v_s := get_day_close_summary(p_date); v_e := (v_s->>'expected_cash')::numeric; v_v := p_declared_cash - v_e;
  INSERT INTO daily_user_close (user_id,tenant_id,close_date,opening_balance,total_collection,total_expense,internal_transfer,expected_cash,declared_cash,variance,status,closed_at,closed_by,note)
  VALUES (v_uid,v_tid,p_date,(v_s->>'opening_balance')::numeric,(v_s->>'total_collection')::numeric,(v_s->>'total_expense')::numeric,(v_s->>'internal_transfer')::numeric,v_e,p_declared_cash,v_v,'closed',now(),v_uid,p_note)
  ON CONFLICT (user_id,close_date,tenant_id) DO UPDATE SET declared_cash=p_declared_cash,variance=v_v,status='closed',closed_at=now(),closed_by=v_uid,note=p_note,updated_at=now()
  WHERE daily_user_close.status IN ('open','reopened')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('status','error','message','Cannot close'); END IF;
  RETURN jsonb_build_object('status','success','id',v_id,'variance',v_v);
END; $$;

CREATE OR REPLACE FUNCTION public.request_day_reopen(p_close_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_tid uuid := get_user_tenant_id(); v_rid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_user_close WHERE id=p_close_id AND tenant_id=v_tid AND status='closed') THEN
    RETURN jsonb_build_object('status','error','message','Invalid or not closed');
  END IF;
  INSERT INTO reopen_requests (close_id,tenant_id,requested_by,reason) VALUES (p_close_id,v_tid,v_uid,p_reason) RETURNING id INTO v_rid;
  RETURN jsonb_build_object('status','success','request_id',v_rid);
END; $$;

CREATE OR REPLACE FUNCTION public.approve_day_reopen(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_cid uuid;
BEGIN
  IF NOT is_admin_or_owner() THEN RETURN jsonb_build_object('status','error','message','Admin access required'); END IF;
  SELECT close_id INTO v_cid FROM reopen_requests WHERE id=p_request_id AND status='pending';
  IF v_cid IS NULL THEN RETURN jsonb_build_object('status','error','message','Invalid request'); END IF;
  UPDATE reopen_requests SET status='approved',approved_by=v_uid,approved_at=now() WHERE id=p_request_id;
  UPDATE daily_user_close SET status='reopened',updated_at=now() WHERE id=v_cid;
  RETURN jsonb_build_object('status','success','close_id',v_cid);
END; $$;
