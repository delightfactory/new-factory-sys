-- Migration: Fix Invoice Cost Distribution
-- Description: This migration updates process_purchase_invoice to distribute 
-- discount, tax, and shipping costs proportionally across item unit prices
-- before calculating the Weighted Average Cost (WACO).
--
-- Formula: adjusted_unit_price = unit_price * (total_amount / items_total)
-- 
-- This ensures inventory is valued at TRUE acquisition cost.
--
-- IMPORTANT: Updates unit_cost column (used by frontend UI for display)
-- NOT price_per_unit (which was incorrectly used by previous migrations)

-- Drop existing function first
DROP FUNCTION IF EXISTS process_purchase_invoice(BIGINT);

-- Recreated function with cost distribution fix
CREATE OR REPLACE FUNCTION process_purchase_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_old_qty NUMERIC;
    v_old_cost NUMERIC;
    v_new_cost NUMERIC;
    v_total_qty NUMERIC;
    v_remaining_amount NUMERIC;
    v_items_total NUMERIC;
    v_adjustment_factor NUMERIC;
    v_adjusted_unit_price NUMERIC;
BEGIN
    -- 1. Get Invoice
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    -- 2. Calculate Adjustment Factor for Cost Distribution
    -- This distributes discount, tax, and shipping proportionally across items
    SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_items_total 
    FROM purchase_invoice_items 
    WHERE invoice_id = p_invoice_id;
    
    IF v_items_total > 0 THEN
        -- adjustment_factor = total_amount / items_total
        -- total_amount already includes: items_total + tax + shipping - discount
        v_adjustment_factor := v_invoice.total_amount / v_items_total;
    ELSE
        v_adjustment_factor := 1;
    END IF;

    -- 3. Process Items (Stock & Cost Update with Adjusted Prices)
    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- Calculate adjusted unit price (includes proportional discount/tax/shipping)
        v_adjusted_unit_price := v_item.unit_price * v_adjustment_factor;
        
        -- A. Raw Materials
        IF v_item.item_type = 'raw_material' THEN
            -- Use unit_cost (the column displayed in UI)
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost 
            FROM raw_materials WHERE id = v_item.raw_material_id;
            
            -- Prepare defaults if null
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            -- Calculate Weighted Average Cost using ADJUSTED price
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            -- Update Stock with adjusted cost (unit_cost is what UI displays)
            UPDATE raw_materials 
            SET quantity = v_total_qty,
                unit_cost = v_new_cost,
                updated_at = NOW()
            WHERE id = v_item.raw_material_id;
            
        -- B. Packaging Materials
        ELSIF v_item.item_type = 'packaging_material' THEN
            -- Get current values for WACO calculation
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost 
            FROM packaging_materials WHERE id = v_item.packaging_material_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE packaging_materials
            SET quantity = v_total_qty,
                unit_cost = v_new_cost,
                updated_at = NOW()
            WHERE id = v_item.packaging_material_id;

        -- C. Finished Products (Buying Ready Made)
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost 
            FROM finished_products WHERE id = v_item.finished_product_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE finished_products 
            SET quantity = v_total_qty,
                unit_cost = v_new_cost,
                updated_at = NOW()
            WHERE id = v_item.finished_product_id;
        
        -- D. Semi-Finished Products
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost 
            FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_adjusted_unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_adjusted_unit_price;
            END IF;
            
            UPDATE semi_finished_products
            SET quantity = v_total_qty,
                unit_cost = v_new_cost,
                updated_at = NOW()
            WHERE id = v_item.semi_finished_product_id;
        END IF;
    END LOOP;

    -- 4. Financial Transaction (If Paid)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        -- Check Balance
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
            RAISE EXCEPTION 'Insufficient funds in treasury for payment';
        END IF;
        
        -- Deduct from Treasury
        UPDATE treasuries 
        SET balance = balance - v_invoice.paid_amount 
        WHERE id = v_invoice.treasury_id;
        
        -- Log Transaction
        INSERT INTO financial_transactions (
            treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date
        ) VALUES (
            v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'expense', 'purchase_payment',
            'Payment for Purchase Invoice #' || v_invoice.id, 'purchase_invoice', v_invoice.id::text, v_invoice.transaction_date
        );
    END IF;

    -- 5. Update Supplier Balance (Debt)
    -- Total - Paid = Remaining. If Remaining > 0, we owe them.
    -- Supplier Balance: Debt Increases by Remaining Amount (Balance becomes more negative)
    -- Convention: Negative balance = We owe them
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties 
        SET balance = balance - v_remaining_amount -- Subtract = We owe them more
        WHERE id = v_invoice.supplier_id;
    END IF;

    -- 6. Mark as Posted
    UPDATE purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'adjustment_factor', v_adjustment_factor);
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION process_purchase_invoice(BIGINT) IS 
'Processes a purchase invoice: updates inventory with WACO using adjusted unit prices 
that include proportional distribution of discount, tax, and shipping costs.
Formula: adjusted_price = original_price * (total_amount / items_total)';
