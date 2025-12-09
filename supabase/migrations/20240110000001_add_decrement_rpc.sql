-- Function to safely decrement raw material stock
CREATE OR REPLACE FUNCTION decrement_raw_material(row_id BIGINT, amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE raw_materials
  SET quantity = quantity - amount
  WHERE id = row_id;
  
  -- Optional: Raise error if stock becomes negative? 
  -- For now, we allow negative stock or rely on app validation.
END;
$$;
