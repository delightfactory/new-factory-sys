-- ============================================================================
-- RPC: Complete Production Order
-- Handles the complex logic of checking stock, deducting raw materials,
-- and adding semi-finished products for a multi-item order.
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_record RECORD;
  v_item RECORD;
  v_ingredient RECORD;
  v_missing_items TEXT[] := ARRAY[]::TEXT[];
  v_total_cost NUMERIC := 0;
  v_item_cost NUMERIC;
BEGIN
  -- 1. Get Order Status
  SELECT * INTO v_order_record FROM production_orders WHERE id = p_order_id;
  
  IF v_order_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order_record.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order is already completed');
  END IF;

  -- 2. Create a temporary table to aggregate total raw material requirements
  CREATE TEMPORARY TABLE temp_requirements AS
  SELECT 
    sfi.raw_material_id,
    rm.name as raw_material_name,
    SUM((poi.quantity * sfi.percentage) / 100) as required_qty
  FROM production_order_items poi
  JOIN semi_finished_products sfp ON poi.semi_finished_id = sfp.id
  JOIN semi_finished_ingredients sfi ON sfp.id = sfi.semi_finished_id
  JOIN raw_materials rm ON sfi.raw_material_id = rm.id
  WHERE poi.production_order_id = p_order_id
  GROUP BY sfi.raw_material_id, rm.name;

  -- 3. Check for sufficient stock
  SELECT array_agg(tr.raw_material_name) INTO v_missing_items
  FROM temp_requirements tr
  JOIN raw_materials rm ON tr.raw_material_id = rm.id
  WHERE rm.quantity < tr.required_qty;

  IF array_length(v_missing_items, 1) > 0 THEN
    DROP TABLE temp_requirements;
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient stock for: ' || array_to_string(v_missing_items, ', '));
  END IF;

  -- 4. Deduct Raw Materials (Consume)
  FOR v_ingredient IN SELECT * FROM temp_requirements LOOP
    -- Deduct stock
    UPDATE raw_materials 
    SET quantity = quantity - v_ingredient.required_qty,
        updated_at = NOW()
    WHERE id = v_ingredient.raw_material_id;

    -- Log movement (OUT)
    INSERT INTO inventory_movements (item_id, item_type, movement_type, quantity, reason, reference_id)
    VALUES (v_ingredient.raw_material_id, 'raw_materials', 'out', v_ingredient.required_qty, 'Production Order Consumption', p_order_id::TEXT);
  END LOOP;

  -- 5. Add Semi-Finished Products (Produce)
  FOR v_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP
    -- Calculate specific item cost based on current raw material costs
    -- This is a simplified cost calculation based on ingredients
    SELECT COALESCE(SUM((rm.unit_cost * sfi.percentage) / 100), 0) INTO v_item_cost
    FROM semi_finished_ingredients sfi
    JOIN raw_materials rm ON sfi.raw_material_id = rm.id
    WHERE sfi.semi_finished_id = v_item.semi_finished_id;

    -- Add stock
    UPDATE semi_finished_products
    SET quantity = quantity + v_item.quantity,
        unit_cost = CASE WHEN quantity + v_item.quantity > 0 
                         THEN ((quantity * unit_cost) + (v_item.quantity * v_item_cost)) / (quantity + v_item.quantity)
                         ELSE v_item_cost END, -- Weighted Average Cost
        updated_at = NOW()
    WHERE id = v_item.semi_finished_id;

    -- Log movement (IN)
    INSERT INTO inventory_movements (item_id, item_type, movement_type, quantity, reason, reference_id)
    VALUES (v_item.semi_finished_id, 'semi_finished_products', 'in', v_item.quantity, 'Production Order Output', p_order_id::TEXT);

    -- Update Item Cost in Order
    UPDATE production_order_items 
    SET unit_cost = v_item_cost, 
        total_cost = v_item.quantity * v_item_cost
    WHERE id = v_item.id;

    v_total_cost := v_total_cost + (v_item.quantity * v_item_cost);
  END LOOP;

  -- 6. Update Order Status
  UPDATE production_orders 
  SET status = 'completed', 
      total_cost = v_total_cost,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Cleanup
  DROP TABLE temp_requirements;

  RETURN jsonb_build_object('success', true, 'message', 'Production order completed successfully');
EXCEPTION WHEN OTHERS THEN
  -- Cleanup in case of error (though transaction rollback handles DB changes, temp table might persist in session)
  DROP TABLE IF EXISTS temp_requirements;
  RAISE;
END;
$$;


-- ============================================================================
-- RPC: Complete Packaging Order
-- Handles deduction of Semi-Finished + Packaging Materials -> Output Finished
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_packaging_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_record RECORD;
  v_item RECORD;
  v_req RECORD;
  v_missing_items TEXT[] := ARRAY[]::TEXT[];
  v_total_cost NUMERIC := 0;
  v_item_cost NUMERIC;
  v_semi_cost NUMERIC;
  v_pack_cost NUMERIC;
BEGIN
  -- 1. Get Order Status
  SELECT * INTO v_order_record FROM packaging_orders WHERE id = p_order_id;
  
  IF v_order_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order_record.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order is already completed');
  END IF;

  -- 2. Create temp table for requirements (Semi-Finished AND Packaging Materials)
  CREATE TEMPORARY TABLE temp_pack_requirements (
    item_id BIGINT,
    item_type TEXT, -- 'semi_finished' or 'packaging'
    item_name TEXT,
    required_qty NUMERIC
  );

  -- 2a. Calculate Semi-Finished Requirements
  INSERT INTO temp_pack_requirements
  SELECT 
    text_fp.semi_finished_id,
    'semi_finished',
    sfp.name,
    SUM(poi.quantity * text_fp.semi_finished_quantity) -- Qty * Needed per unit
  FROM packaging_order_items poi
  JOIN finished_products text_fp ON poi.finished_product_id = text_fp.id
  JOIN semi_finished_products sfp ON text_fp.semi_finished_id = sfp.id
  WHERE poi.packaging_order_id = p_order_id
  GROUP BY text_fp.semi_finished_id, sfp.name;

  -- 2b. Calculate Packaging Material Requirements
  INSERT INTO temp_pack_requirements
  SELECT 
    fpp.packaging_material_id,
    'packaging',
    pm.name,
    SUM(poi.quantity * fpp.quantity)
  FROM packaging_order_items poi
  JOIN finished_product_packaging fpp ON poi.finished_product_id = fpp.finished_product_id
  JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
  WHERE poi.packaging_order_id = p_order_id
  GROUP BY fpp.packaging_material_id, pm.name;

  -- 3. Check Stock
  -- Check Semi-Finished
  SELECT array_append(v_missing_items, tr.item_name) INTO v_missing_items
  FROM temp_pack_requirements tr
  JOIN semi_finished_products sfp ON tr.item_id = sfp.id
  WHERE tr.item_type = 'semi_finished' AND sfp.quantity < tr.required_qty;

  -- Check Packaging Materials
  SELECT array_append(v_missing_items, tr.item_name) INTO v_missing_items
  FROM temp_pack_requirements tr
  JOIN packaging_materials pm ON tr.item_id = pm.id
  WHERE tr.item_type = 'packaging' AND pm.quantity < tr.required_qty;

  IF array_length(v_missing_items, 1) > 0 THEN
    DROP TABLE temp_pack_requirements;
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient stock for: ' || array_to_string(v_missing_items, ', '));
  END IF;

  -- 4. Consume Items (Deduct Stock)
  FOR v_req IN SELECT * FROM temp_pack_requirements LOOP
    IF v_req.item_type = 'semi_finished' THEN
      UPDATE semi_finished_products SET quantity = quantity - v_req.required_qty, updated_at = NOW() WHERE id = v_req.item_id;
      INSERT INTO inventory_movements (item_id, item_type, movement_type, quantity, reason, reference_id)
      VALUES (v_req.item_id, 'semi_finished_products', 'out', v_req.required_qty, 'Packaging Consumption', p_order_id::TEXT);
    ELSE
      UPDATE packaging_materials SET quantity = quantity - v_req.required_qty, updated_at = NOW() WHERE id = v_req.item_id;
      INSERT INTO inventory_movements (item_id, item_type, movement_type, quantity, reason, reference_id)
      VALUES (v_req.item_id, 'packaging_materials', 'out', v_req.required_qty, 'Packaging Consumption', p_order_id::TEXT);
    END IF;
  END LOOP;

  -- 5. Produce Finished Products
  FOR v_item IN SELECT * FROM packaging_order_items WHERE packaging_order_id = p_order_id LOOP
    -- Calculate Cost
    -- Cost = (Semi Qty * Semi Cost) + Sum(Pack Qty * Pack Cost)
    
    -- Semi Cost
    SELECT (fp.semi_finished_quantity * sfp.unit_cost) INTO v_semi_cost
    FROM finished_products fp
    JOIN semi_finished_products sfp ON fp.semi_finished_id = sfp.id
    WHERE fp.id = v_item.finished_product_id;

    -- Packaging Cost
    SELECT COALESCE(SUM(fpp.quantity * pm.unit_cost), 0) INTO v_pack_cost
    FROM finished_product_packaging fpp
    JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
    WHERE fpp.finished_product_id = v_item.finished_product_id;

    v_item_cost := COALESCE(v_semi_cost, 0) + COALESCE(v_pack_cost, 0);

    -- Add Stock
    UPDATE finished_products
    SET quantity = quantity + v_item.quantity,
        unit_cost = CASE WHEN quantity + v_item.quantity > 0 
                         THEN ((quantity * unit_cost) + (v_item.quantity * v_item_cost)) / (quantity + v_item.quantity)
                         ELSE v_item_cost END,
        updated_at = NOW()
    WHERE id = v_item.finished_product_id;

    -- Log Movement
    INSERT INTO inventory_movements (item_id, item_type, movement_type, quantity, reason, reference_id)
    VALUES (v_item.finished_product_id, 'finished_products', 'in', v_item.quantity, 'Packaging Output', p_order_id::TEXT);

    -- Update Item Cost
    UPDATE packaging_order_items 
    SET unit_cost = v_item_cost, 
        total_cost = v_item.quantity * v_item_cost
    WHERE id = v_item.id;

    v_total_cost := v_total_cost + (v_item.quantity * v_item_cost);
  END LOOP;

  -- 6. Update Order Status
  UPDATE packaging_orders 
  SET status = 'completed', 
      total_cost = v_total_cost,
      updated_at = NOW()
  WHERE id = p_order_id;

  DROP TABLE temp_pack_requirements;
  RETURN jsonb_build_object('success', true, 'message', 'Packaging order completed successfully');

EXCEPTION WHEN OTHERS THEN
  DROP TABLE IF EXISTS temp_pack_requirements;
  RAISE;
END;
$$;
