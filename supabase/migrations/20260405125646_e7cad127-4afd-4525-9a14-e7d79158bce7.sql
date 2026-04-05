
CREATE OR REPLACE FUNCTION public.process_investor_dividend(
    p_investor_id UUID,
    p_amount NUMERIC,
    p_reinvest BOOLEAN,
    p_actor_id UUID DEFAULT NULL,
    p_accrue_profit NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_due_dividend NUMERIC;
    v_actor UUID;
    v_capital NUMERIC;
    v_profit_pct NUMERIC;
    v_last_profit_date DATE;
BEGIN
    v_actor := COALESCE(p_actor_id, auth.uid());
    IF v_actor IS NULL THEN RAISE EXCEPTION 'Actor ID required'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Dividend amount must be positive'; END IF;

    -- Lock row and get current state
    SELECT due_dividend, capital, monthly_profit_percent, last_profit_date
    INTO v_due_dividend, v_capital, v_profit_pct, v_last_profit_date
    FROM investors WHERE id = p_investor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investor not found'; END IF;

    -- Accrue monthly profit if provided and not yet accrued this month
    IF p_accrue_profit > 0 THEN
        -- Only accrue if last_profit_date is not this month
        IF v_last_profit_date IS NULL OR v_last_profit_date < date_trunc('month', CURRENT_DATE)::date THEN
            v_due_dividend := v_due_dividend + p_accrue_profit;
            UPDATE investors
            SET due_dividend = v_due_dividend,
                accumulated_profit = accumulated_profit + p_accrue_profit,
                last_profit_date = CURRENT_DATE
            WHERE id = p_investor_id;
        ELSE
            -- Already accrued this month, just use current due_dividend
            NULL;
        END IF;
    END IF;

    -- Now validate
    IF v_due_dividend < p_amount THEN
        RAISE EXCEPTION 'Insufficient due dividend: available %, requested %', v_due_dividend, p_amount;
    END IF;

    -- Process payment
    UPDATE investors
    SET due_dividend = due_dividend - p_amount,
        capital = CASE WHEN p_reinvest THEN capital + p_amount ELSE capital END,
        principal_amount = CASE WHEN p_reinvest THEN principal_amount + p_amount ELSE principal_amount END,
        updated_at = now()
    WHERE id = p_investor_id;

    -- Record transaction
    INSERT INTO financial_transactions(transaction_type, amount, reference_id, notes, created_by, approval_status)
    VALUES ('investor_dividend'::fin_transaction_type, p_amount, p_investor_id::text,
        CASE WHEN p_reinvest THEN 'Dividend reinvested to capital' ELSE 'Dividend cash payout' END,
        v_actor, 'approved'::approval_status);

    -- Audit log
    INSERT INTO audit_logs(entity_type, entity_id, action_type, user_id, details)
    VALUES ('investor', p_investor_id, 'dividend_payment', v_actor,
        jsonb_build_object(
            'amount', p_amount,
            'reinvest', p_reinvest,
            'accrued_profit', p_accrue_profit,
            'previous_due_dividend', v_due_dividend,
            'new_due_dividend', v_due_dividend - p_amount,
            'date', to_char(now(), 'YYYY-MM-DD')
        )
    );
END;
$$;
