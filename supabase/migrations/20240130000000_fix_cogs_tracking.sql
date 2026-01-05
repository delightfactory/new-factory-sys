-- ============================================================================
-- Migration: Fix COGS Tracking in Sales Invoice Processing
-- Date: 2026-01-04
-- Purpose: Restore unit_cost_at_sale capture that was accidentally removed
--          when comprehensive_inventory_tracking migration overwrote the function.
-- 
-- IMPORTANT: This migration ONLY adds the missing COGS tracking logic.
--            All existing functionality is preserved:
--            - Inventory deduction ✓
--            - Movement logging ✓
--            - Treasury updates ✓
--            - Customer balance updates ✓
-- ============================================================================

-- Drop and recreate the function with COGS tracking restored
DROP FUNCTION IF EXISTS process_sales_invoice(BIGINT);

CREATE OR REPLACE FUNCTION process_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_current_qty NUMERIC;
    v_current_cost NUMERIC;  -- Added: variable for unit cost
    v_remaining_amount NUMERIC;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_item_id := NULL;
        v_current_cost := 0;  -- Initialize cost for each item
        
        IF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            -- Fetch both quantity AND unit_cost
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost 
            FROM finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج #%', v_item_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            -- Fetch both quantity AND unit_cost
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost 
            FROM raw_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للخامة #%', v_item_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            -- Fetch both quantity AND unit_cost
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost 
            FROM packaging_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي لمادة التعبئة #%', v_item_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            -- Fetch both quantity AND unit_cost
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost 
            FROM semi_finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج نصف المصنع #%', v_item_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;
        END IF;

        -- =====================================================================
        -- COGS TRACKING: Capture unit cost at time of sale (THE FIX)
        -- This was accidentally removed in the comprehensive_inventory_tracking migration
        -- =====================================================================
        UPDATE sales_invoice_items 
        SET unit_cost_at_sale = v_current_cost 
        WHERE id = v_item.id;

        -- LOG MOVEMENT (preserved from comprehensive_inventory_tracking)
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'out',
                v_item.quantity,
                'فاتورة بيع #' || v_invoice.invoice_number,
                'SI-' || p_invoice_id::TEXT
            );
        END IF;
        
    END LOOP;

    -- Financials (preserved exactly as before)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'income', 'sales_payment', 'تحصيل فاتورة بيع #' || v_invoice.invoice_number, 'sales_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    -- Customer balance (preserved exactly as before)
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Add comment for documentation
-- ============================================================================
COMMENT ON FUNCTION process_sales_invoice(BIGINT) IS 
'Processes a draft sales invoice: deducts inventory, logs movements, captures COGS (unit_cost_at_sale), handles treasury/customer balance updates.';
