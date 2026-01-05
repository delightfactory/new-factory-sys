-- ============================================================================
-- Migration: Enhance Atomic Production Order with WACO
-- Date: 2026-01-05
-- Purpose: Add Weighted Average Cost calculation to complete_production_order_atomic
-- 
-- RISK LEVEL: 🟠 MEDIUM - Enhances existing function, no breaking changes
-- 
-- Changes:
--   1. Calculate production cost from raw material costs
--   2. Apply WACO to semi_finished_products.unit_cost
--   3. Update production_order_items with unit_cost and total_cost
--   4. Update production_orders with total_cost
--
-- Rollback:
--   Restore original function from 20240127000001_atomic_orders.sql
-- ============================================================================

-- Drop and recreate with WACO support
DROP FUNCTION IF EXISTS complete_production_order_atomic(BIGINT);

CREATE OR REPLACE FUNCTION complete_production_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_ingredient RECORD;
    v_order_code TEXT;
    v_recipe_batch_size NUMERIC;
    v_ratio NUMERIC;
    v_qty_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    -- WACO Variables (NEW)
    v_item_cost NUMERIC;
    v_total_cost NUMERIC := 0;
BEGIN
    -- Get Order Code
    SELECT code INTO v_order_code FROM production_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PO-' || p_order_id::TEXT; END IF;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP
        
        -- Get Recipe Details
        SELECT recipe_batch_size INTO v_recipe_batch_size 
        FROM semi_finished_products 
        WHERE id = r_item.semi_finished_id;

        IF v_recipe_batch_size IS NULL OR v_recipe_batch_size = 0 THEN v_recipe_batch_size := 100; END IF;
        v_ratio := r_item.quantity / v_recipe_batch_size;

        -- =====================================================================
        -- Calculate Item Cost from Raw Materials (WACO Enhancement)
        -- This calculates the cost of producing this item based on ingredients
        -- =====================================================================
        SELECT COALESCE(SUM(
            (rm.unit_cost * si.quantity * v_ratio)
        ), 0) INTO v_item_cost
        FROM semi_finished_ingredients si
        JOIN raw_materials rm ON si.raw_material_id = rm.id
        WHERE si.semi_finished_id = r_item.semi_finished_id;

        -- Deduct Raw Materials (Ingredients)
        FOR r_ingredient IN 
            SELECT * FROM semi_finished_ingredients WHERE semi_finished_id = r_item.semi_finished_id 
        LOOP
            v_qty_needed := r_ingredient.quantity * v_ratio;

            SELECT quantity INTO v_prev_balance FROM raw_materials WHERE id = r_ingredient.raw_material_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_qty_needed;

            UPDATE raw_materials SET quantity = v_new_balance, updated_at = NOW() 
            WHERE id = r_ingredient.raw_material_id;

            PERFORM log_inventory_movement(
                r_ingredient.raw_material_id, 'raw_materials', 'out', v_qty_needed, 
                'استهلاك في أمر إنتاج #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current semi-finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost 
        FROM semi_finished_products WHERE id = r_item.semi_finished_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;
        
        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Semi-Finished Product (Enhancement)
        -- New Cost = (Old Qty × Old Cost + New Qty × New Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_cost;
        END IF;

        -- Update Semi-Finished Product with quantity AND cost
        UPDATE semi_finished_products 
        SET quantity = v_new_balance, 
            unit_cost = v_new_cost,
            updated_at = NOW() 
        WHERE id = r_item.semi_finished_id;

        PERFORM log_inventory_movement(
            r_item.semi_finished_id, 'semi_finished_products', 'in', r_item.quantity, 
            'إنتاج من أمر تشغيل #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost (Enhancement)
        -- =====================================================================
        UPDATE production_order_items 
        SET unit_cost = v_item_cost, 
            total_cost = r_item.quantity * v_item_cost
        WHERE id = r_item.id;

        v_total_cost := v_total_cost + (r_item.quantity * v_item_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost (Enhancement)
    -- =====================================================================
    UPDATE production_orders 
    SET status = 'completed', 
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION complete_production_order_atomic(BIGINT) IS 
'Completes a production order atomically:
- Deducts raw materials based on recipe
- Adds semi-finished products with WACO calculation
- Logs all inventory movements
- Updates order items and total cost';
