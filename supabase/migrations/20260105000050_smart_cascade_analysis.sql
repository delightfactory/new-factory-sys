-- ============================================================================
-- Migration: Smart Production Cascade - Shortage Analysis
-- Date: 2026-01-05
-- Purpose: Add RPC function to analyze packaging order requirements
--          and identify semi-finished product shortages
-- 
-- RISK LEVEL: 🟢 LOW - New function, no changes to existing logic
-- ============================================================================

-- Function: Analyze Packaging Order Requirements
-- Returns JSON with shortage analysis and suggested production orders
CREATE OR REPLACE FUNCTION analyze_packaging_requirements(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_can_complete BOOLEAN := true;
    v_shortages JSONB := '[]'::JSONB;
    v_suggested_production JSONB := '[]'::JSONB;
    r_req RECORD;
    v_sf_shortage NUMERIC;
BEGIN
    -- Check if order exists and is pending
    IF NOT EXISTS (SELECT 1 FROM packaging_orders WHERE id = p_order_id AND status = 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'can_complete', false,
            'error', 'الأمر غير موجود أو ليس في حالة الانتظار'
        );
    END IF;

    -- Calculate requirements using a query (no temp table)
    FOR r_req IN 
        SELECT 
            sfp.id AS sf_id,
            sfp.name AS sf_name,
            sfp.unit AS sf_unit,
            sfp.quantity AS available_qty,
            COALESCE(sfp.recipe_batch_size, 100) AS recipe_batch_size,
            SUM(poi.quantity * COALESCE(fp.semi_finished_quantity, 0)) AS required_qty
        FROM packaging_order_items poi
        JOIN finished_products fp ON poi.finished_product_id = fp.id
        JOIN semi_finished_products sfp ON fp.semi_finished_id = sfp.id
        WHERE poi.packaging_order_id = p_order_id
          AND fp.semi_finished_id IS NOT NULL
        GROUP BY sfp.id, sfp.name, sfp.unit, sfp.quantity, sfp.recipe_batch_size
    LOOP
        v_sf_shortage := r_req.required_qty - COALESCE(r_req.available_qty, 0);
        
        IF v_sf_shortage > 0 THEN
            v_can_complete := false;
            
            -- Add to shortages list
            v_shortages := v_shortages || jsonb_build_object(
                'semi_finished_id', r_req.sf_id,
                'name', r_req.sf_name,
                'unit', r_req.sf_unit,
                'required_qty', r_req.required_qty,
                'available_qty', COALESCE(r_req.available_qty, 0),
                'shortage_qty', v_sf_shortage
            );
            
            -- Add to suggested production list
            v_suggested_production := v_suggested_production || jsonb_build_object(
                'semi_finished_id', r_req.sf_id,
                'name', r_req.sf_name,
                'unit', r_req.sf_unit,
                'suggested_qty', v_sf_shortage,
                'recipe_batch_size', r_req.recipe_batch_size
            );
        END IF;
    END LOOP;

    -- Build final result
    v_result := jsonb_build_object(
        'success', true,
        'can_complete', v_can_complete,
        'order_id', p_order_id,
        'shortages', v_shortages,
        'suggested_production', v_suggested_production,
        'shortage_count', jsonb_array_length(v_shortages)
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analyze_packaging_requirements(BIGINT) IS 
'Analyzes a packaging order to identify semi-finished product shortages.
Returns:
- can_complete: boolean indicating if order can be completed with current stock
- shortages: array of items with insufficient stock
- suggested_production: array of suggested production order items';
