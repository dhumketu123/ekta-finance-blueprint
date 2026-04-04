
-- 1. Add enum value if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'fin_transaction_type'
        AND e.enumlabel = 'investor_capital_injection'
    ) THEN
        ALTER TYPE fin_transaction_type ADD VALUE 'investor_capital_injection';
    END IF;
END$$;

-- 2. Create atomic, schema-accurate RPC
CREATE OR REPLACE FUNCTION public.process_investor_capital_injection(
    p_investor_id UUID,
    p_amount NUMERIC,
    p_fee NUMERIC DEFAULT 0,
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
    v_today TEXT;
BEGIN
    -- Resolve actor
    v_actor := COALESCE(p_actor_id, auth.uid());
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Actor ID required';
    END IF;

    -- Validate positive amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- Lock investor row to prevent race conditions
    SELECT capital INTO v_current_capital
    FROM investors
    WHERE id = p_investor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Investor not found';
    END IF;

    -- Update capital and principal
    UPDATE investors
    SET capital = capital + p_amount,
        principal_amount = principal_amount + p_amount,
        updated_at = now()
    WHERE id = p_investor_id;

    v_today := to_char(now(), 'YYYY-MM-DD');

    -- Insert financial transaction (schema-accurate columns)
    INSERT INTO financial_transactions(
        transaction_type,
        amount,
        reference_id,
        notes,
        created_by,
        approval_status
    )
    VALUES (
        'investor_capital_injection'::fin_transaction_type,
        p_amount,
        p_investor_id::text,
        'Capital injection' || CASE WHEN p_fee > 0 THEN ' (Fee: ৳' || p_fee::text || ')' ELSE '' END,
        v_actor,
        'approved'::approval_status
    );

    -- Record processing fee if applicable
    IF p_fee > 0 THEN
        INSERT INTO financial_transactions(
            transaction_type,
            amount,
            reference_id,
            notes,
            created_by,
            approval_status
        )
        VALUES (
            'investor_capital_injection'::fin_transaction_type,
            p_fee,
            p_investor_id::text,
            'Capital injection processing fee',
            v_actor,
            'approved'::approval_status
        );
    END IF;

    -- Insert audit log (schema-accurate columns)
    INSERT INTO audit_logs(
        entity_type,
        entity_id,
        action_type,
        user_id,
        details
    )
    VALUES (
        'investor',
        p_investor_id,
        'capital_injection',
        v_actor,
        jsonb_build_object(
            'amount', p_amount,
            'fee', p_fee,
            'previous_capital', v_current_capital,
            'new_capital', v_current_capital + p_amount,
            'date', v_today
        )
    );
END;
$$;
