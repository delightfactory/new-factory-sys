-- Decrement Semi-Finished Stock
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

-- Decrement Packaging Material Stock
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
