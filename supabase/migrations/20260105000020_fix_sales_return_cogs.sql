-- ============================================================================
-- Migration: Fix COGS Tracking in Sales Returns
-- Date: 2026-01-05
-- Purpose: Restore unit_cost_at_return capture in process_sales_return
-- 
-- RISK LEVEL: 🟡 LOW - Only affects NEW sales returns
-- 
-- Problem:
--   The comprehensive_inventory_tracking migration (20240126000000) 
--   overwrote process_sales_return and removed the unit_cost_at_return capture
--   that was added in financial_pnl migration (20240114000010).
--
-- Solution:
--   Recreate process_sales_return with:
--   1. Inventory updates ✓
--   2. Movement logging ✓  
--   3. Party balance updates ✓
--   4. unit_cost_at_return capture ✓ (THE FIX)
--
-- Rollback:
--   If issues occur, apply the previous version from 20240126000000
-- ============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS process_sales_return(BIGINT);

-- Recreated function with COGS tracking restored
CREATE OR REPLACE FUNCTION process_sales_return(p_return_id BIGINT) 
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_item_id BIGINT;
    v_item_type_str TEXT;
    v_current_cost NUMERIC;  -- Variable to capture unit cost
BEGIN
    -- 1. Get Return Data
    SELECT * INTO v_return FROM sales_returns WHERE id = p_return_id;
    
    IF v_return.status = 'posted' THEN 
        RAISE EXCEPTION 'المرتجع معالج بالفعل'; 
    END IF;

    -- 2. Process Items: Increase Stock + Capture Cost
    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        v_item_id := NULL;
        v_current_cost := 0;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            -- Get current cost BEFORE updating
            SELECT COALESCE(unit_cost, 0) INTO v_current_cost 
            FROM raw_materials WHERE id = v_item_id;
            -- Update stock
            UPDATE raw_materials 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT COALESCE(unit_cost, 0) INTO v_current_cost 
            FROM packaging_materials WHERE id = v_item_id;
            UPDATE packaging_materials 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT COALESCE(unit_cost, 0) INTO v_current_cost 
            FROM finished_products WHERE id = v_item_id;
            UPDATE finished_products 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT COALESCE(unit_cost, 0) INTO v_current_cost 
            FROM semi_finished_products WHERE id = v_item_id;
            UPDATE semi_finished_products 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
        END IF;

        -- =====================================================================
        -- COGS TRACKING: Capture unit cost at time of return (THE FIX)
        -- This is used for accurate P&L calculation
        -- =====================================================================
        UPDATE sales_return_items 
        SET unit_cost_at_return = v_current_cost 
        WHERE id = v_item.id;

        -- Log Movement (IN - items coming back to our stock)
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'in',
                v_item.quantity,
                'مرتجع بيع #' || COALESCE(v_return.return_number, v_return.id::TEXT),
                'SR-' || p_return_id::TEXT
            );
        END IF;
    END LOOP;

    -- 3. Update Customer Balance
    -- مرتجع البيع: العميل أرجع البضاعة، ننقص ما يدين لنا به
    UPDATE parties 
    SET balance = balance - v_return.total_amount 
    WHERE id = v_return.customer_id;

    -- 4. Mark as Posted
    UPDATE sales_returns 
    SET status = 'posted', updated_at = NOW() 
    WHERE id = p_return_id;
END;
$$;

COMMENT ON FUNCTION process_sales_return(BIGINT) IS 
'Processes a sales return: adds items to inventory, captures unit_cost_at_return for COGS tracking, logs movements, and updates customer balance.';
