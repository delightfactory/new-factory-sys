CREATE OR REPLACE FUNCTION get_next_code(table_name text, prefix text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  max_code text;
  next_num integer;
  result_code text;
BEGIN
  -- Execute dynamic query to get the maximum code from the specified table
  -- Assumes code format is 'PREFIX-XXXX'
  EXECUTE format('SELECT MAX(code) FROM %I WHERE code LIKE %L', table_name, prefix || '%')
  INTO max_code;

  IF max_code IS NULL THEN
    next_num := 1;
  ELSE
    -- Extract the number part after the prefix (assuming format PREFIX-NUMBER)
    -- Length of prefix + 1 (for hyphen if you want, or just prefix length)
    -- Let's assume standard format PREFIX-0001
    BEGIN
        next_num := CAST(substring(max_code from length(prefix) + 2) AS INTEGER) + 1;
    EXCEPTION WHEN OTHERS THEN
        next_num := 1; -- Fallback if parsing fails
    END;
  END IF;

  -- Format the next code with padding (e.g., 001)
  result_code := prefix || '-' || lpad(next_num::text, 3, '0');
  
  RETURN result_code;
END;
$$;
