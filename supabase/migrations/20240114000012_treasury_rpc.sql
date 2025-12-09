-- Create RPC functions for Treasury Balance Management

CREATE OR REPLACE FUNCTION decrement_treasury_balance(p_treasury_id BIGINT, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE treasuries
    SET balance = balance - p_amount
    WHERE id = p_treasury_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Treasury not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION increment_treasury_balance(p_treasury_id BIGINT, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE treasuries
    SET balance = balance + p_amount
    WHERE id = p_treasury_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Treasury not found';
    END IF;
END;
$$;
