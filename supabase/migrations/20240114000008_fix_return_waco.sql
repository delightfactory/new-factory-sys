-- Migration: Fix Purchase Return WACO Logic (Reverse Calculation)

DROP FUNCTION IF EXISTS process_purchase_return(BIGINT);

CREATE OR REPLACE FUNCTION process_purchase_return(p_return_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_current_qty NUMERIC;
    v_current_cost NUMERIC;
    v_new_cost NUMERIC;
    v_total_value NUMERIC;
    v_return_value NUMERIC;
    v_new_qty NUMERIC;
BEGIN
    SELECT * INTO v_return FROM purchase_returns WHERE id = p_return_id;
    
    IF v_return.status != 'draft' THEN
        RAISE EXCEPTION 'Return is already processed';
    END IF;

    FOR v_item IN SELECT * FROM purchase_return_items WHERE return_id = p_return_id LOOP
        
        -- vars
        v_current_qty := 0;
        v_current_cost := 0;

        -- Get Current State
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, price_per_unit INTO v_current_qty, v_current_cost FROM raw_materials WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity, price_per_unit INTO v_current_qty, v_current_cost FROM packaging_materials WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity, price_per_unit INTO v_current_qty, v_current_cost FROM finished_products WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity, price_per_unit INTO v_current_qty, v_current_cost FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
        END IF;

        v_current_qty := COALESCE(v_current_qty, 0);
        v_current_cost := COALESCE(v_current_cost, 0);

        -- Validate Stock
        IF v_current_qty < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock to return (Item Type: %, ID: %)', v_item.item_type, v_item.id;
        END IF;

        -- Calculate Reverse WACO
        -- Current Value
        v_total_value := v_current_qty * v_current_cost;
        -- Return Value (using the Specific Return Price)
        v_return_value := v_item.quantity * v_item.unit_price;
        
        v_new_qty := v_current_qty - v_item.quantity;
        
        IF v_new_qty > 0 THEN
            -- New Cost = (Total Value - Return Value) / New Qty
            v_new_cost := (v_total_value - v_return_value) / v_new_qty;
            -- Safety: If cost becomes negative (e.g. huge profit on return), mathematically it's correct for Inventory Value, 
            -- but practically strange. We allow it as it balances the books.
            -- However, usually we cap at 0 or handle gain separately. For now, strict math.
             IF v_new_cost < 0 THEN v_new_cost := 0; END IF; -- Prevent negative cost
        ELSE
            v_new_cost := 0; -- No stock, no cost (or keep last? 0 is safer).
        END IF;

        -- Update Stock & Cost
        IF v_item.item_type = 'raw_material' THEN
            UPDATE raw_materials SET quantity = v_new_qty, price_per_unit = v_new_cost WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = v_new_qty, price_per_unit = v_new_cost WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = v_new_qty, price_per_unit = v_new_cost WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
             UPDATE semi_finished_products SET quantity = v_new_qty, price_per_unit = v_new_cost WHERE id = v_item.semi_finished_product_id;
        END IF;

    END LOOP;

    -- Update Financials (Supplier Balance)
    -- Purchase Return -> We returned goods. Supplier owes us (or our Debt decreases).
    -- Decrease Supplier Balance (Liability).
    -- If Balance is Negative (We owe them), Adding Positive Amount (Return Amount) makes it less negative.
    -- Wait. Our unified logic: Balance > 0 (They owe us), Balance < 0 (We owe them).
    -- Purchase Invoice (Expense) -> Subtracted from Balance. (More Negative).
    -- Purchase Return (Refund-ish) -> Add to Balance. (Less Negative).
    
    UPDATE parties SET balance = balance + v_return.total_amount WHERE id = v_return.supplier_id;

    UPDATE purchase_returns SET status = 'posted' WHERE id = p_return_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
