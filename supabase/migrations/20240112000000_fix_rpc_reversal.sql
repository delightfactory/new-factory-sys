-- Ensure Raw Material Decrement supports negative values (Increment)
CREATE OR REPLACE FUNCTION decrement_raw_material(row_id BIGINT, amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Simple subtraction. If amount is negative, it effectively adds.
  -- Ensure we don't hit negative stock? Ideally yes, but for Cancel/Reversal we want to allow it?
  -- Actually, "Cancel" adds back stock, so stock goes UP. Safe.
  UPDATE raw_materials
  SET quantity = quantity - amount
  WHERE id = row_id;
END;
$$;

-- Ensure Semi-Finished Decrement supports negative values
CREATE OR REPLACE FUNCTION decrement_semi_finished(row_id BIGINT, amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE semi_finished_products
  SET quantity = quantity - amount
  WHERE id = row_id;
END;
$$;

-- Ensure Packaging Material Decrement supports negative values
CREATE OR REPLACE FUNCTION decrement_packaging_material(row_id BIGINT, amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE packaging_materials
  SET quantity = quantity - amount
  WHERE id = row_id;
END;
$$;
