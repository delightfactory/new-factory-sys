-- ============================================================================
-- Migration: Unified Process Purchase Invoice
-- Date: 2026-01-05
-- Purpose: Merge cost distribution logic with inventory movement tracking
-- 
-- RISK LEVEL: 🟠 MEDIUM - Affects NEW purchase invoices only
-- 
-- Problem:
--   Two migrations had conflicting implementations:
--   - 20240125000000: Added cost distribution (adjustment_factor) but NO movement logging
--   - 20240126000000: Added movement logging but NO cost distribution
--
-- Solution:
--   This migration combines BOTH features:
--   1. ✅ Cost distribution (discount/tax/shipping spread across items)
--   2. ✅ WACO calculation with adjusted prices
--   3. ✅ Inventory movement logging
--   4. ✅ Treasury updates
--   5. ✅ Supplier balance updates
--
-- Formula:
--   adjusted_unit_price = unit_price × (total_amount / items_subtotal)
--   Where: total_amount = items_subtotal + tax + shipping - discount
--
-- Rollback:
--   Restore from 20240126000000_comprehensive_inventory_tracking.sql
-- ============================================================================

-- Drop existing function to avoid conflicts
DROP FUNCTION IF EXISTS process_purchase_invoice(BIGINT);

-- Unified function with all features
CREATE OR REPLACE FUNCTION process_purchase_invoice(p_invoice_id BIGINT) 
RETURNS JSONB 
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_old_qty NUMERIC;
    v_old_cost NUMERIC;
    v_new_cost NUMERIC;
    v_total_qty NUMERIC;
    v_remaining_amount NUMERIC;
    v_item_id BIGINT;
    v_item_type_str TEXT;
    -- Cost Distribution Variables
    v_items_subtotal NUMERIC;
    v_adjustment_factor NUMERIC;
    v_adjusted_unit_price NUMERIC;
BEGIN
    -- =========================================================================
    -- 1. Get Invoice
    -- =========================================================================
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'الفاتورة غير موجودة');
    END IF;
    
    IF v_invoice.status != 'draft' THEN
        RETURN jsonb_build_object('success', false, 'message', 'الفاتورة معالجة بالفعل أو ملغاة');
    END IF;

    -- =========================================================================
    -- 2. Calculate Cost Distribution Factor
    -- This spreads discount, tax, and shipping across items proportionally
    -- =========================================================================
    SELECT COALESCE(SUM(quantity * unit_price), 0) 
    INTO v_items_subtotal 
    FROM purchase_invoice_items 
    WHERE invoice_id = p_invoice_id;
    
    IF v_items_subtotal > 0 THEN
        -- adjustment_factor = total_amount / items_subtotal
        -- If total = 1000 and subtotal = 1100 (10% discount), factor = 0.909
        -- If total = 1100 and subtotal = 1000 (10% tax), factor = 1.1
        v_adjustment_factor := v_invoice.total_amount / v_items_subtotal;
    ELSE
        v_adjustment_factor := 1;
    END IF;

    -- =========================================================================
    -- 3. Process Items: Update Inventory with Adjusted Costs
    -- =========================================================================
    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- Initialize variables
        v_old_qty := 0; 
        v_old_cost := 0;
        v_item_id := NULL;

        -- Calculate adjusted unit price (includes proportional discount/tax/shipping)
        v_adjusted_unit_price := v_item.unit_price * v_adjustment_factor;

        -- =====================================================================
        -- A. Raw Materials
        -- =====================================================================
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            
            SELECT quantity, COALESCE(unit_cost, 0) 
            INTO v_old_qty, v_old_cost 
            FROM raw_materials 
            WHERE id = v_item_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            -- Calculate WACO with adjusted price
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE raw_materials 
            SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() 
            WHERE id = v_item_id;
            
        -- =====================================================================
        -- B. Packaging Materials
        -- =====================================================================
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            
            SELECT quantity, COALESCE(unit_cost, 0) 
            INTO v_old_qty, v_old_cost 
            FROM packaging_materials 
            WHERE id = v_item_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE packaging_materials 
            SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() 
            WHERE id = v_item_id;
            
        -- =====================================================================
        -- C. Finished Products
        -- =====================================================================
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            
            SELECT quantity, COALESCE(unit_cost, 0) 
            INTO v_old_qty, v_old_cost 
            FROM finished_products 
            WHERE id = v_item_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE finished_products 
            SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() 
            WHERE id = v_item_id;
            
        -- =====================================================================
        -- D. Semi-Finished Products
        -- =====================================================================
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            
            SELECT quantity, COALESCE(unit_cost, 0) 
            INTO v_old_qty, v_old_cost 
            FROM semi_finished_products 
            WHERE id = v_item_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE semi_finished_products 
            SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() 
            WHERE id = v_item_id;
        END IF;

        -- =====================================================================
        -- Log Inventory Movement
        -- =====================================================================
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'in',
                v_item.quantity,
                'فاتورة شراء #' || v_invoice.invoice_number,
                'PI-' || p_invoice_id::TEXT
            );
        END IF;

    END LOOP;

    -- =========================================================================
    -- 4. Treasury Updates (If Paid)
    -- =========================================================================
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        -- Check treasury balance
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
            RAISE EXCEPTION 'رصيد الخزينة غير كافٍ للدفع';
        END IF;
        
        -- Deduct from treasury
        UPDATE treasuries 
        SET balance = balance - v_invoice.paid_amount 
        WHERE id = v_invoice.treasury_id;
        
        -- Log transaction
        INSERT INTO financial_transactions (
            treasury_id, party_id, amount, transaction_type, category, 
            description, reference_type, reference_id, transaction_date
        ) VALUES (
            v_invoice.treasury_id, 
            v_invoice.supplier_id, 
            v_invoice.paid_amount, 
            'expense', 
            'purchase_payment',
            'دفع فاتورة شراء #' || v_invoice.invoice_number, 
            'purchase_invoice', 
            v_invoice.id::text, 
            v_invoice.transaction_date
        );
    END IF;

    -- =========================================================================
    -- 5. Supplier Balance Update
    -- Convention: Negative balance = We owe them
    -- Remaining amount = What we still owe
    -- =========================================================================
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties 
        SET balance = balance - v_remaining_amount 
        WHERE id = v_invoice.supplier_id;
    END IF;

    -- =========================================================================
    -- 6. Mark as Posted
    -- =========================================================================
    UPDATE purchase_invoices 
    SET status = 'posted' 
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true, 
        'adjustment_factor', ROUND(v_adjustment_factor, 4),
        'message', 'تمت معالجة الفاتورة بنجاح'
    );
END;
$$;

COMMENT ON FUNCTION process_purchase_invoice(BIGINT) IS 
'Processes a purchase invoice with:
1. Cost distribution (discount/tax/shipping spread across items)
2. WACO calculation with adjusted prices
3. Inventory movement logging
4. Treasury and supplier balance updates';
