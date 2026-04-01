
-- 1. Add 'alumni' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'alumni';

-- 2. Create owner_exit_settlements table
CREATE TABLE public.owner_exit_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  exit_date date NOT NULL DEFAULT CURRENT_DATE,
  tenure_days integer NOT NULL DEFAULT 0,
  total_capital numeric NOT NULL DEFAULT 0,
  total_profit_earned numeric NOT NULL DEFAULT 0,
  early_exit_penalty numeric NOT NULL DEFAULT 0,
  loyalty_bonus numeric NOT NULL DEFAULT 0,
  settlement_amount numeric NOT NULL DEFAULT 0,
  final_payout numeric NOT NULL DEFAULT 0,
  non_compete_months integer NOT NULL DEFAULT 24,
  exit_status text NOT NULL DEFAULT 'processed',
  legal_doc_url text,
  processed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_exit_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner view exit_settlements"
  ON public.owner_exit_settlements FOR SELECT
  TO authenticated
  USING (is_admin_or_owner() OR (owner_id = auth.uid()));

CREATE POLICY "Admin manage exit_settlements"
  ON public.owner_exit_settlements FOR ALL
  TO authenticated
  USING (is_admin_or_owner())
  WITH CHECK (is_admin_or_owner());

CREATE POLICY "Tenant isolation exit_settlements"
  ON public.owner_exit_settlements FOR ALL
  TO authenticated
  USING ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()))
  WITH CHECK ((get_user_role() = 'super_admin') OR (tenant_id = get_user_tenant_id()));

-- 3. Create legal-vault storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('legal-vault', 'legal-vault', false);

CREATE POLICY "Users view own legal docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'legal-vault' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admin view all legal docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'legal-vault' AND is_admin_or_owner());

CREATE POLICY "Admin upload legal docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'legal-vault' AND is_admin_or_owner());

-- 4. Create process_owner_exit RPC
CREATE OR REPLACE FUNCTION public.process_owner_exit(
  _owner_user_id uuid,
  _total_capital numeric,
  _total_profit_earned numeric,
  _early_exit_penalty numeric DEFAULT 0,
  _loyalty_bonus numeric DEFAULT 0,
  _non_compete_months integer DEFAULT 24,
  _notes text DEFAULT NULL,
  _legal_doc_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_role text;
  _caller_id uuid;
  _tenant uuid;
  _settlement_amount numeric;
  _final_payout numeric;
  _tenure_days integer;
  _profile_created_at timestamptz;
  _settlement_id uuid;
BEGIN
  -- 1. Verify caller is admin or super_admin
  _caller_role := get_user_role();
  _caller_id := auth.uid();
  
  IF _caller_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Access denied: admin or super_admin role required');
  END IF;

  -- 2. Verify target is an active owner
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _owner_user_id AND role = 'owner') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Target user does not have owner role');
  END IF;

  -- 3. Get tenure
  SELECT created_at INTO _profile_created_at FROM public.profiles WHERE id = _owner_user_id;
  IF _profile_created_at IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Owner profile not found');
  END IF;
  
  _tenure_days := EXTRACT(DAY FROM (now() - _profile_created_at))::integer;

  -- 4. Get tenant
  SELECT tenant_id INTO _tenant FROM public.profiles WHERE id = _owner_user_id;

  -- 5. Calculate settlement
  _settlement_amount := _total_capital + _total_profit_earned;
  _final_payout := _settlement_amount - _early_exit_penalty + _loyalty_bonus;
  IF _final_payout < 0 THEN _final_payout := 0; END IF;

  -- 6. Record settlement
  INSERT INTO public.owner_exit_settlements (
    owner_id, tenant_id, tenure_days, total_capital, total_profit_earned,
    early_exit_penalty, loyalty_bonus, settlement_amount, final_payout,
    non_compete_months, processed_by, notes, legal_doc_url
  ) VALUES (
    _owner_user_id, _tenant, _tenure_days, _total_capital, _total_profit_earned,
    _early_exit_penalty, _loyalty_bonus, _settlement_amount, _final_payout,
    _non_compete_months, _caller_id, _notes, _legal_doc_url
  )
  RETURNING id INTO _settlement_id;

  -- 7. Transition role: owner -> alumni
  UPDATE public.user_roles SET role = 'alumni' WHERE user_id = _owner_user_id AND role = 'owner';
  UPDATE public.profiles SET role = 'alumni' WHERE id = _owner_user_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Owner exit processed successfully',
    'settlement_id', _settlement_id,
    'final_payout', _final_payout,
    'tenure_days', _tenure_days
  );

EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Cannot process exit: active financial references exist. Please settle all outstanding transactions first.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Exit processing failed: ' || SQLERRM);
END;
$$;
