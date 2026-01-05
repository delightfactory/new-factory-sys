-- ============================================================================
-- Migration: Enhance Atomic Packaging Order with WACO
-- Date: 2026-01-05
-- Purpose: Add Weighted Average Cost calculation to complete_packaging_order_atomic
-- 
-- RISK LEVEL: 🟠 MEDIUM - Enhances existing function, no breaking changes
-- 
-- Changes:
--   1. Calculate packaging cost from semi-finished + packaging materials
--   2. Apply WACO to finished_products.unit_cost
--   3. Update packaging_order_items with unit_cost and total_cost
--   4. Update packaging_orders with total_cost
--
-- Rollback:
--   Restore original function from 20240127000001_atomic_orders.sql
-- ============================================================================

-- Drop and recreate with WACO support
DROP FUNCTION IF EXISTS complete_packaging_order_atomic(BIGINT);

CREATE OR REPLACE FUNCTION complete_packaging_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_pkg RECORD;
    v_order_code TEXT;
    v_sf_id BIGINT;
    v_sf_qty_per_unit NUMERIC;
    v_sf_needed NUMERIC;
    v_pkg_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    -- WACO Variables (NEW)
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    v_semi_cost NUMERIC;
    v_pack_cost NUMERIC;
    v_item_cost NUMERIC;
    v_total_cost NUMERIC := 0;
BEGIN
    -- Get Order Code
    SELECT code INTO v_order_code FROM packaging_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PKG-' || p_order_id::TEXT; END IF;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM packaging_order_items WHERE packaging_order_id = p_order_id LOOP
        
        -- Get Finished Product Details
        SELECT semi_finished_id, semi_finished_quantity 
        INTO v_sf_id, v_sf_qty_per_unit
        FROM finished_products 
        WHERE id = r_item.finished_product_id;

        -- =====================================================================
        -- Calculate Item Cost (WACO Enhancement)
        -- Cost = (Semi-Finished Qty × Cost) + Sum(Packaging Qty × Cost)
        -- =====================================================================
        
        -- 1. Semi-Finished Cost Component
        v_semi_cost := 0;
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            SELECT COALESCE(v_sf_qty_per_unit * sfp.unit_cost, 0) INTO v_semi_cost
            FROM semi_finished_products sfp
            WHERE sfp.id = v_sf_id;
        END IF;

        -- 2. Packaging Materials Cost Component
        SELECT COALESCE(SUM(fpp.quantity * pm.unit_cost), 0) INTO v_pack_cost
        FROM finished_product_packaging fpp
        JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
        WHERE fpp.finished_product_id = r_item.finished_product_id;

        -- Total item cost = semi-finished cost + packaging cost
        v_item_cost := COALESCE(v_semi_cost, 0) + COALESCE(v_pack_cost, 0);

        -- Deduct Semi-Finished
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            v_sf_needed := r_item.quantity * v_sf_qty_per_unit;

            SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = v_sf_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_sf_needed;

            UPDATE semi_finished_products 
            SET quantity = v_new_balance, updated_at = NOW() 
            WHERE id = v_sf_id;

            PERFORM log_inventory_movement(
                v_sf_id, 'semi_finished_products', 'out', v_sf_needed, 
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
            );
        END IF;

        -- Deduct Packaging Materials
        FOR r_pkg IN 
            SELECT * FROM finished_product_packaging WHERE finished_product_id = r_item.finished_product_id
        LOOP
            v_pkg_needed := r_item.quantity * r_pkg.quantity;

            SELECT quantity INTO v_prev_balance FROM packaging_materials WHERE id = r_pkg.packaging_material_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_pkg_needed;

            UPDATE packaging_materials 
            SET quantity = v_new_balance, updated_at = NOW() 
            WHERE id = r_pkg.packaging_material_id;

            PERFORM log_inventory_movement(
                r_pkg.packaging_material_id, 'packaging_materials', 'out', v_pkg_needed, 
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost 
        FROM finished_products WHERE id = r_item.finished_product_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;
        
        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Finished Product (Enhancement)
        -- New Cost = (Old Qty × Old Cost + New Qty × New Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_cost;
        END IF;

        -- Update Finished Product with quantity AND cost
        UPDATE finished_products 
        SET quantity = v_new_balance, 
            unit_cost = v_new_cost,
            updated_at = NOW() 
        WHERE id = r_item.finished_product_id;

        PERFORM log_inventory_movement(
            r_item.finished_product_id, 'finished_products', 'in', r_item.quantity, 
            'إنتاج تعبئة وتغليف #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost (Enhancement)
        -- =====================================================================
        UPDATE packaging_order_items 
        SET unit_cost = v_item_cost, 
            total_cost = r_item.quantity * v_item_cost
        WHERE id = r_item.id;

        v_total_cost := v_total_cost + (r_item.quantity * v_item_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost (Enhancement)
    -- =====================================================================
    UPDATE packaging_orders 
    SET status = 'completed', 
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION complete_packaging_order_atomic(BIGINT) IS 
'Completes a packaging order atomically:
- Deducts semi-finished products based on recipe
- Deducts packaging materials
- Adds finished products with WACO calculation
- Logs all inventory movements
- Updates order items and total cost';
