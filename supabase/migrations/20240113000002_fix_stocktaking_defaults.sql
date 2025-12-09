-- RPC: Generate Snapshot Update
-- Fix: Ensure ALL item types default 'counted_quantity' to 'system_quantity' (Open Counting)
-- Previously, some were defaulting to 0.

CREATE OR REPLACE FUNCTION generate_inventory_snapshot(
  p_session_id BIGINT,
  p_include_raw BOOLEAN,
  p_include_packaging BOOLEAN,
  p_include_semi BOOLEAN,
  p_include_finished BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Raw Materials
  IF p_include_raw THEN
    INSERT INTO inventory_count_items (session_id, item_type, item_id, product_name, unit, system_quantity, counted_quantity, unit_cost)
    SELECT 
      p_session_id,
      'raw_material',
      id,
      name,
      unit,
      quantity,
      quantity, -- Default to current Quantity
      unit_cost
    FROM raw_materials;
  END IF;

  -- 2. Packaging Materials
  IF p_include_packaging THEN
    INSERT INTO inventory_count_items (session_id, item_type, item_id, product_name, unit, system_quantity, counted_quantity, unit_cost)
    SELECT 
      p_session_id,
      'packaging_material',
      id,
      name,
      unit,
      quantity,
      quantity, -- Default to current Quantity (Was 0)
      unit_cost
    FROM packaging_materials;
  END IF;

  -- 3. Semi Finished
  IF p_include_semi THEN
    INSERT INTO inventory_count_items (session_id, item_type, item_id, product_name, unit, system_quantity, counted_quantity, unit_cost)
    SELECT 
      p_session_id,
      'semi_finished',
      id,
      name,
      unit,
      quantity,
      quantity, -- Default to current Quantity (Was 0)
      unit_cost
    FROM semi_finished_products;
  END IF;

  -- 4. Finished Products
  IF p_include_finished THEN
    INSERT INTO inventory_count_items (session_id, item_type, item_id, product_name, unit, system_quantity, counted_quantity, unit_cost)
    SELECT 
      p_session_id,
      'finished_product',
      id,
      name,
      unit,
      quantity,
      quantity, -- Default to current Quantity (Was 0)
      unit_cost
    FROM finished_products;
  END IF;
  
  -- Update session status to in_progress
  UPDATE inventory_count_sessions SET status = 'in_progress' WHERE id = p_session_id;
END;
$$;
