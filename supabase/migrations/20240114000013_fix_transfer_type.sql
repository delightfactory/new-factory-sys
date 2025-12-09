-- Fix: Correct transaction type in transfer_between_treasuries
-- The source INSERT was using 'transfer' instead of 'expense'

CREATE OR REPLACE FUNCTION transfer_between_treasuries(
    p_from_treasury_id BIGINT,
    p_to_treasury_id BIGINT,
    p_amount NUMERIC,
    p_description TEXT
) RETURNS JSONB AS $$
DECLARE
    v_from_balance NUMERIC;
    v_to_balance NUMERIC;
BEGIN
    -- Validate
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;
    
    IF p_from_treasury_id = p_to_treasury_id THEN
         RAISE EXCEPTION 'Cannot transfer to the same treasury';
    END IF;

    -- Check Source Balance
    IF (SELECT balance FROM treasuries WHERE id = p_from_treasury_id) < p_amount THEN
        RAISE EXCEPTION 'Insufficient funds in source treasury';
    END IF;

    -- 1. Deduct from Source
    UPDATE treasuries 
    SET balance = balance - p_amount, updated_at = NOW()
    WHERE id = p_from_treasury_id;

    -- Log Source Transaction (EXPENSE type for proper P&L)
    INSERT INTO financial_transactions (
        treasury_id, amount, transaction_type, category, description, transaction_date
    ) VALUES (
        p_from_treasury_id, p_amount, 'expense', 'transfer_out', 
        'Transfer TO Treasury #' || p_to_treasury_id || ': ' || p_description,
        CURRENT_DATE
    );

    -- 2. Add to Destination
    UPDATE treasuries 
    SET balance = balance + p_amount, updated_at = NOW()
    WHERE id = p_to_treasury_id;

    -- Log Destination Transaction (INCOME type)
    INSERT INTO financial_transactions (
        treasury_id, amount, transaction_type, category, description, transaction_date
    ) VALUES (
        p_to_treasury_id, p_amount, 'income', 'transfer_in', 
        'Transfer FROM Treasury #' || p_from_treasury_id || ': ' || p_description,
        CURRENT_DATE
    );

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
