
-- 1. Add enum values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'fin_transaction_type' AND e.enumlabel = 'investor_withdrawal'
    ) THEN
        ALTER TYPE fin_transaction_type ADD VALUE 'investor_withdrawal';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'fin_transaction_type' AND e.enumlabel = 'investor_dividend'
    ) THEN
        ALTER TYPE fin_transaction_type ADD VALUE 'investor_dividend';
    END IF;
END$$;

-- 2. Atomic Withdrawal RPC
CREATE OR REPLACE FUNCTION public.process_investor_withdrawal(
    p_investor_id UUID,
    p_amount NUMERIC,
    p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_capital NUMERIC;
    v_actor UUID;
BEGIN
    v_actor := COALESCE(p_actor_id, auth.uid());
    IF v_actor IS NULL THEN RAISE EXCEPTION 'Actor ID required'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive'; END IF;

    SELECT capital INTO v_current_capital
    FROM investors WHERE id = p_investor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investor not found'; END IF;
    IF v_current_capital < p_amount THEN RAISE EXCEPTION 'Insufficient capital'; END IF;

    UPDATE investors
    SET capital = capital - p_amount, updated_at = now()
    WHERE id = p_investor_id;

    INSERT INTO financial_transactions(transaction_type, amount, reference_id, notes, created_by, approval_status)
    VALUES ('investor_withdrawal'::fin_transaction_type, p_amount, p_investor_id::text, 'Investor withdrawal', v_actor, 'approved'::approval_status);

    INSERT INTO audit_logs(entity_type, entity_id, action_type, user_id, details)
    VALUES ('investor', p_investor_id, 'withdrawal', v_actor,
        jsonb_build_object('amount', p_amount, 'previous_capital', v_current_capital, 'new_capital', v_current_capital - p_amount, 'date', to_char(now(), 'YYYY-MM-DD'))
    );
END;
$$;

-- 3. Atomic Dividend RPC
CREATE OR REPLACE FUNCTION public.process_investor_dividend(
    p_investor_id UUID,
    p_amount NUMERIC,
    p_reinvest BOOLEAN DEFAULT false,
    p_actor_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_due_dividend NUMERIC;
    v_actor UUID;
BEGIN
    v_actor := COALESCE(p_actor_id, auth.uid());
    IF v_actor IS NULL THEN RAISE EXCEPTION 'Actor ID required'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Dividend amount must be positive'; END IF;

    SELECT due_dividend INTO v_due_dividend
    FROM investors WHERE id = p_investor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investor not found'; END IF;
    IF v_due_dividend < p_amount THEN RAISE EXCEPTION 'Insufficient due dividend'; END IF;

    UPDATE investors
    SET due_dividend = due_dividend - p_amount,
        capital = CASE WHEN p_reinvest THEN capital + p_amount ELSE capital END,
        principal_amount = CASE WHEN p_reinvest THEN principal_amount + p_amount ELSE principal_amount END,
        updated_at = now()
    WHERE id = p_investor_id;

    INSERT INTO financial_transactions(transaction_type, amount, reference_id, notes, created_by, approval_status)
    VALUES ('investor_dividend'::fin_transaction_type, p_amount, p_investor_id::text,
        CASE WHEN p_reinvest THEN 'Dividend reinvested to capital' ELSE 'Dividend cash payout' END,
        v_actor, 'approved'::approval_status);

    INSERT INTO audit_logs(entity_type, entity_id, action_type, user_id, details)
    VALUES ('investor', p_investor_id, 'dividend_payment', v_actor,
        jsonb_build_object('amount', p_amount, 'reinvest', p_reinvest, 'previous_due_dividend', v_due_dividend, 'new_due_dividend', v_due_dividend - p_amount, 'date', to_char(now(), 'YYYY-MM-DD'))
    );
END;
$$;
