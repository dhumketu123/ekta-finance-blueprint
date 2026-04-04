
-- Create archive schema
CREATE SCHEMA IF NOT EXISTS archive;

-- Archive table for audit_logs (mirrors public.audit_logs)
CREATE TABLE IF NOT EXISTS archive.audit_logs (LIKE public.audit_logs INCLUDING ALL);

-- Archive table for financial_transactions (mirrors public.financial_transactions)
CREATE TABLE IF NOT EXISTS archive.financial_transactions (LIKE public.financial_transactions INCLUDING ALL);

-- Admin-only archival RPC: audit_logs
CREATE OR REPLACE FUNCTION public.archive_old_audit_logs(p_cutoff DATE)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    IF NOT is_admin_or_owner() THEN
        RAISE EXCEPTION 'Unauthorized: admin or owner role required';
    END IF;

    WITH moved AS (
        DELETE FROM public.audit_logs
        WHERE created_at < p_cutoff
        RETURNING *
    )
    INSERT INTO archive.audit_logs SELECT * FROM moved;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Admin-only archival RPC: financial_transactions
CREATE OR REPLACE FUNCTION public.archive_old_financial_transactions(p_cutoff DATE)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    IF NOT is_admin_or_owner() THEN
        RAISE EXCEPTION 'Unauthorized: admin or owner role required';
    END IF;

    WITH moved AS (
        DELETE FROM public.financial_transactions
        WHERE created_at < p_cutoff
        RETURNING *
    )
    INSERT INTO archive.financial_transactions SELECT * FROM moved;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
