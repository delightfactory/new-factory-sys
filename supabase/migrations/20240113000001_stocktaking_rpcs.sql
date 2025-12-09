-- RPC: Generate Snapshot
-- Populates the inventory_count_items table based on current stock levels
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
      quantity, -- Default counted to system? Or 0? Let's default to system for easier "Confirm" workflow, or 0 for Blind. Let's do 0 for safety.
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
      0,
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
      0,
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
      0,
      unit_cost
    FROM finished_products;
  END IF;
  
  -- Update session status to in_progress
  UPDATE inventory_count_sessions SET status = 'in_progress' WHERE id = p_session_id;
END;
$$;


-- RPC: Reconcile Session
-- Applies the differences to the actual stock
CREATE OR REPLACE FUNCTION reconcile_inventory_session(p_session_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r_item RECORD;
  v_diff NUMERIC;
BEGIN
  -- Loop through all items in the session
  FOR r_item IN SELECT * FROM inventory_count_items WHERE session_id = p_session_id LOOP
    
    -- Calculate difference (Counted - System)
    -- e.g., Counted 8, System 10. Diff = -2. We need to subtract 2 from stock.
    -- Wait, if System was 10 at snapshot, and we count 8.
    -- If we mistakenly just set stock to 8, we might overwrite sales/production that happened DURING the count.
    -- Best Practice: Apply the DIFFERENCE to the CURRENT stock.
    -- Current Stock = Current Stock + Difference.
    -- Live Stock might be 9 now (1 sold). 9 + (-2) = 7. 
    -- This assumes the count represents the state at Snapshot Time.
    
    v_diff := r_item.counted_quantity - r_item.system_quantity;
    
    IF v_diff <> 0 THEN
      CASE r_item.item_type
        WHEN 'raw_material' THEN
          UPDATE raw_materials SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'packaging_material' THEN
           UPDATE packaging_materials SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'semi_finished' THEN
           UPDATE semi_finished_products SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'finished_product' THEN
           UPDATE finished_products SET quantity = quantity + v_diff WHERE id = r_item.item_id;
      END CASE;
    END IF;
    
  END LOOP;
  
  -- Mark as completed
  UPDATE inventory_count_sessions SET status = 'completed' WHERE id = p_session_id;
END;
$$;
