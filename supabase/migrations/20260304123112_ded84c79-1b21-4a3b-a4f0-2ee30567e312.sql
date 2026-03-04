
-- =========================================================
-- PHASE 1: OWNERSHIP AUTO-PILOT - INVESTOR MANAGEMENT ENGINE
-- Adapted for existing investors table
-- =========================================================

-- STEP 1: Add weekly share tracking columns to existing investors table
ALTER TABLE public.investors
  ADD COLUMN IF NOT EXISTS weekly_share numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS weekly_paid_until date,
  ADD COLUMN IF NOT EXISTS total_weekly_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flag boolean NOT NULL DEFAULT false;

-- STEP 2: Create investor_weekly_transactions table
CREATE TABLE public.investor_weekly_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('weekly', 'capital')),
  amount numeric NOT NULL CHECK (amount > 0),
  weeks_covered integer NOT NULL DEFAULT 0,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);

-- STEP 3: Enable RLS
ALTER TABLE public.investor_weekly_transactions ENABLE ROW LEVEL SECURITY;

-- STEP 4: Tenant isolation + role-based RLS policies
CREATE POLICY "Tenant isolation investor_weekly_transactions"
ON public.investor_weekly_transactions
FOR ALL
USING (
  (get_user_role() = 'super_admin'::text) OR (tenant_id = get_user_tenant_id())
)
WITH CHECK (
  (get_user_role() = 'super_admin'::text) OR (tenant_id = get_user_tenant_id())
);

CREATE POLICY "Admin/owner full access investor_weekly_transactions"
ON public.investor_weekly_transactions
FOR ALL
USING (is_admin_or_owner())
WITH CHECK (is_admin_or_owner());

CREATE POLICY "Treasurer view investor_weekly_transactions"
ON public.investor_weekly_transactions
FOR SELECT
USING (is_treasurer());

CREATE POLICY "Investors view own weekly_transactions"
ON public.investor_weekly_transactions
FOR SELECT
USING (
  is_investor() AND investor_id IN (
    SELECT id FROM public.investors WHERE user_id = auth.uid()
  )
);

-- STEP 5: Performance indexes
CREATE INDEX idx_iwt_tenant ON public.investor_weekly_transactions(tenant_id);
CREATE INDEX idx_iwt_investor ON public.investor_weekly_transactions(investor_id);
CREATE INDEX idx_iwt_date ON public.investor_weekly_transactions(transaction_date DESC);
CREATE INDEX idx_investors_risk ON public.investors(risk_flag) WHERE risk_flag = true;

-- STEP 6: Secure CRUD RPC — create investor weekly transaction
CREATE OR REPLACE FUNCTION public.create_investor_weekly_transaction(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_result_id uuid;
  v_investor_id uuid;
  v_type text;
  v_amount numeric;
  v_weeks integer;
BEGIN
  v_tenant_id := get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context not found';
  END IF;

  v_investor_id := (p_data->>'investor_id')::uuid;
  v_type := p_data->>'type';
  v_amount := (p_data->>'amount')::numeric;
  v_weeks := COALESCE((p_data->>'weeks_covered')::integer, 0);

  -- Verify investor belongs to same tenant
  IF NOT EXISTS (SELECT 1 FROM investors WHERE id = v_investor_id AND tenant_id = v_tenant_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Investor not found or access denied';
  END IF;

  INSERT INTO investor_weekly_transactions (
    investor_id, type, amount, weeks_covered, transaction_date, notes, created_by, tenant_id
  ) VALUES (
    v_investor_id,
    v_type,
    v_amount,
    v_weeks,
    COALESCE((p_data->>'transaction_date')::date, CURRENT_DATE),
    p_data->>'notes',
    auth.uid(),
    v_tenant_id
  )
  RETURNING id INTO v_result_id;

  -- Update investor weekly tracking
  IF v_type = 'weekly' THEN
    UPDATE investors
    SET total_weekly_paid = total_weekly_paid + v_amount,
        weekly_paid_until = COALESCE(weekly_paid_until, CURRENT_DATE) + (v_weeks * INTERVAL '7 days'),
        updated_at = now()
    WHERE id = v_investor_id;
  ELSIF v_type = 'capital' THEN
    UPDATE investors
    SET capital = capital + v_amount,
        updated_at = now()
    WHERE id = v_investor_id;
  END IF;

  RETURN v_result_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_investor_weekly_transaction(jsonb) TO authenticated;

-- STEP 7: Auto-status update function
CREATE OR REPLACE FUNCTION public.update_investor_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := get_user_tenant_id();
  v_updated integer := 0;
BEGIN
  WITH updated AS (
    UPDATE investors
    SET status = 'locked'::investor_status
    WHERE tenant_id = v_tenant
      AND deleted_at IS NULL
      AND weekly_paid_until IS NOT NULL
      AND weekly_paid_until >= CURRENT_DATE
      AND status != 'locked'::investor_status
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  -- Also unlock those past due
  UPDATE investors
  SET status = 'active'::investor_status
  WHERE tenant_id = v_tenant
    AND deleted_at IS NULL
    AND (weekly_paid_until IS NULL OR weekly_paid_until < CURRENT_DATE)
    AND status = 'locked'::investor_status;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_investor_status() TO authenticated;

-- STEP 8: Auto risk detection function
CREATE OR REPLACE FUNCTION public.update_investor_risk_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := get_user_tenant_id();
  v_flagged integer := 0;
  v_cleared integer := 0;
BEGIN
  -- Flag investors with no weekly payment in 21 days
  WITH flagged AS (
    UPDATE investors i
    SET risk_flag = true, updated_at = now()
    WHERE i.tenant_id = v_tenant
      AND i.deleted_at IS NULL
      AND i.risk_flag = false
      AND (
        SELECT COUNT(*)
        FROM investor_weekly_transactions t
        WHERE t.investor_id = i.id
          AND t.type = 'weekly'
          AND t.transaction_date >= CURRENT_DATE - INTERVAL '21 days'
      ) = 0
    RETURNING id
  )
  SELECT COUNT(*) INTO v_flagged FROM flagged;

  -- Clear risk flag for investors who paid recently
  WITH cleared AS (
    UPDATE investors i
    SET risk_flag = false, updated_at = now()
    WHERE i.tenant_id = v_tenant
      AND i.deleted_at IS NULL
      AND i.risk_flag = true
      AND (
        SELECT COUNT(*)
        FROM investor_weekly_transactions t
        WHERE t.investor_id = i.id
          AND t.type = 'weekly'
          AND t.transaction_date >= CURRENT_DATE - INTERVAL '21 days'
      ) > 0
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleared FROM cleared;

  RETURN jsonb_build_object('flagged', v_flagged, 'cleared', v_cleared);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_investor_risk_flags() TO authenticated;
