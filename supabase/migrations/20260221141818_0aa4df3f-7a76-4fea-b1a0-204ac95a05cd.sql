-- ═══════════════════════════════════════════════════
-- Phase 4: Owner Profit Distribution Engine
-- ═══════════════════════════════════════════════════

-- Table: owner_profit_distributions
-- Tracks monthly profit calculations and distributions to owners
CREATE TABLE IF NOT EXISTS public.owner_profit_distributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month date NOT NULL, -- first day of the month (e.g. 2026-02-01)
  
  -- Revenue inputs
  total_interest_collected numeric NOT NULL DEFAULT 0,
  total_penalty_collected numeric NOT NULL DEFAULT 0,
  total_fee_income numeric NOT NULL DEFAULT 0,
  gross_revenue numeric NOT NULL DEFAULT 0,
  
  -- Cost deductions
  investor_profit_paid numeric NOT NULL DEFAULT 0,
  operational_expenses numeric NOT NULL DEFAULT 0,
  provision_for_loss numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  
  -- Net profit
  net_profit numeric NOT NULL DEFAULT 0,
  
  -- Distribution
  distribution_status text NOT NULL DEFAULT 'pending', -- pending, distributed, cancelled
  distributed_at timestamptz,
  distributed_by uuid,
  
  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One distribution per month
  CONSTRAINT unique_period_month UNIQUE (period_month)
);

-- Table: owner_profit_shares
-- Individual owner share from each monthly distribution
CREATE TABLE IF NOT EXISTS public.owner_profit_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  distribution_id uuid NOT NULL REFERENCES public.owner_profit_distributions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL, -- references profiles.id where role = 'owner'
  share_percentage numeric NOT NULL DEFAULT 0,
  share_amount numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending', -- pending, paid, cancelled
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_owner_distribution UNIQUE (distribution_id, owner_id)
);

-- Enable RLS
ALTER TABLE public.owner_profit_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_profit_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admin/owner full access owner_profit_distributions"
  ON public.owner_profit_distributions FOR ALL
  USING (is_admin_or_owner());

CREATE POLICY "Treasurer view owner_profit_distributions"
  ON public.owner_profit_distributions FOR SELECT
  USING (is_treasurer());

CREATE POLICY "Admin/owner full access owner_profit_shares"
  ON public.owner_profit_shares FOR ALL
  USING (is_admin_or_owner());

CREATE POLICY "Owners view own profit shares"
  ON public.owner_profit_shares FOR SELECT
  USING (is_owner() AND owner_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_owner_profit_dist_period ON public.owner_profit_distributions(period_month);
CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_owner ON public.owner_profit_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_profit_shares_dist ON public.owner_profit_shares(distribution_id);

-- Function: Calculate and distribute monthly owner profit
CREATE OR REPLACE FUNCTION public.calculate_owner_profit(_period_month date, _created_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _month_start date;
  _month_end date;
  _interest_collected numeric := 0;
  _penalty_collected numeric := 0;
  _fee_income numeric := 0;
  _investor_profit numeric := 0;
  _gross numeric;
  _deductions numeric;
  _net numeric;
  _dist_id uuid;
  _owner RECORD;
  _owner_count integer := 0;
  _share_pct numeric;
BEGIN
  _month_start := date_trunc('month', _period_month)::date;
  _month_end := (_month_start + interval '1 month')::date;

  -- Check if already calculated
  IF EXISTS (SELECT 1 FROM public.owner_profit_distributions WHERE period_month = _month_start) THEN
    RAISE EXCEPTION 'Profit already calculated for %', to_char(_month_start, 'YYYY-MM');
  END IF;

  -- 1. Calculate revenue from approved financial transactions in the period
  SELECT 
    COALESCE(SUM(CASE WHEN ft.transaction_type = 'loan_repayment' 
      THEN COALESCE((ft.allocation_breakdown->>'interest_paid')::numeric, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ft.transaction_type = 'loan_repayment' 
      THEN COALESCE((ft.allocation_breakdown->>'penalty_paid')::numeric, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ft.transaction_type IN ('admission_fee', 'insurance_premium') 
      THEN ft.amount ELSE 0 END), 0)
  INTO _interest_collected, _penalty_collected, _fee_income
  FROM public.financial_transactions ft
  WHERE ft.approval_status = 'approved'
    AND ft.approved_at >= _month_start
    AND ft.approved_at < _month_end;

  -- 2. Calculate investor profit paid
  SELECT COALESCE(SUM(t.amount), 0)
  INTO _investor_profit
  FROM public.transactions t
  WHERE t.type = 'investor_profit'
    AND t.transaction_date >= _month_start
    AND t.transaction_date < _month_end
    AND t.status = 'paid'
    AND t.deleted_at IS NULL;

  _gross := _interest_collected + _penalty_collected + _fee_income;
  _deductions := _investor_profit;
  _net := _gross - _deductions;

  -- 3. Create distribution record
  INSERT INTO public.owner_profit_distributions (
    period_month, total_interest_collected, total_penalty_collected, total_fee_income,
    gross_revenue, investor_profit_paid, total_deductions, net_profit
  ) VALUES (
    _month_start, _interest_collected, _penalty_collected, _fee_income,
    _gross, _investor_profit, _deductions, _net
  ) RETURNING id INTO _dist_id;

  -- 4. Distribute equally among all active owners
  SELECT COUNT(*) INTO _owner_count
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'owner';

  IF _owner_count > 0 THEN
    _share_pct := ROUND(100.0 / _owner_count, 2);
    
    FOR _owner IN
      SELECT p.id AS owner_id
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE ur.role = 'owner'
    LOOP
      INSERT INTO public.owner_profit_shares (
        distribution_id, owner_id, share_percentage, share_amount
      ) VALUES (
        _dist_id, _owner.owner_id, _share_pct, ROUND(_net * _share_pct / 100, 2)
      );
    END LOOP;
  END IF;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('owner_profit_calculation', 'owner_profit', _dist_id, _created_by,
    jsonb_build_object(
      'period', to_char(_month_start, 'YYYY-MM'),
      'gross_revenue', _gross,
      'deductions', _deductions,
      'net_profit', _net,
      'owner_count', _owner_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'distribution_id', _dist_id,
    'period', to_char(_month_start, 'YYYY-MM'),
    'gross_revenue', _gross,
    'investor_profit_paid', _investor_profit,
    'net_profit', _net,
    'owner_count', _owner_count,
    'share_per_owner', CASE WHEN _owner_count > 0 THEN ROUND(_net / _owner_count, 2) ELSE 0 END
  );
END;
$$;
