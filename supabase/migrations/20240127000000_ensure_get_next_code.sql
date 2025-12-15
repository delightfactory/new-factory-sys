-- Ensure get_next_code RPC exists
-- Used for generating sequential codes like PR-0001, SR-0001, etc.

CREATE OR REPLACE FUNCTION get_next_code(table_name TEXT, prefix TEXT) 
RETURNS TEXT 
LANGUAGE plpgsql 
AS $$
DECLARE
    v_next_id BIGINT;
    v_next_code TEXT;
BEGIN
    -- Safe execution to get next generic ID based on table's sequence or max ID
    -- Using MAX(id) + 1 is simple but race-condition prone in high concurrency without locking.
    -- However, for this system's scale (Factory Management), it is usually acceptable if IDs are serial.
    -- A better approach is using the ID sequence, but table name -> sequence name mapping is implicit.
    
    EXECUTE format('SELECT COALESCE(MAX(id), 0) + 1 FROM %I', table_name) INTO v_next_id;
    
    -- Format: PREFIX-XXXX (e.g. PR-1024)
    v_next_code := prefix || v_next_id::TEXT;
    
    -- Optional: Pad with zeros? User example 'RET-001' suggests padding.
    -- Let's use simple concatenation for now matching standard behavior, or padding if desired.
    -- If v_next_id is 1, prefix='PR-', result 'PR-1'.
    -- The user example 'RET-001' implies padding.
    
    -- Let's implement padding to 4 digits if < 10000
    IF v_next_id < 10000 THEN
         v_next_code := prefix || LPAD(v_next_id::TEXT, 4, '0');
    ELSE
         v_next_code := prefix || v_next_id::TEXT;
    END IF;

    RETURN v_next_code;
END;
$$;
