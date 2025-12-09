-- Enhancement: Void Logic & Full WACO Support

-- 1. Updated Process Purchase Invoice (Apply WACO, to all types)
CREATE OR REPLACE FUNCTION process_purchase_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_old_qty NUMERIC;
    v_old_cost NUMERIC;
    v_new_cost NUMERIC;
    v_total_qty NUMERIC;
    v_remaining_amount NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- Default vars
        v_old_qty := 0; 
        v_old_cost := 0;

        -- Fetch current state based on type
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, price_per_unit INTO v_old_qty, v_old_cost FROM raw_materials WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity, price_per_unit INTO v_old_qty, v_old_cost FROM packaging_materials WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity, price_per_unit INTO v_old_qty, v_old_cost FROM finished_products WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity, price_per_unit INTO v_old_qty, v_old_cost FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
        END IF;

        v_old_qty := COALESCE(v_old_qty, 0);
        v_old_cost := COALESCE(v_old_cost, 0);
        
        -- Calculate WACO
        v_total_qty := v_old_qty + v_item.quantity;
        IF v_total_qty > 0 THEN
            v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_item.unit_price)) / v_total_qty;
        ELSE
            v_new_cost := v_item.unit_price;
        END IF;

        -- Update Stock & Cost
        IF v_item.item_type = 'raw_material' THEN
            UPDATE raw_materials SET quantity = v_total_qty, price_per_unit = v_new_cost, updated_at = NOW() WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = v_total_qty, price_per_unit = v_new_cost, updated_at = NOW() WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = v_total_qty, price_per_unit = v_new_cost, updated_at = NOW() WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            UPDATE semi_finished_products SET quantity = v_total_qty, price_per_unit = v_new_cost, updated_at = NOW() WHERE id = v_item.semi_finished_product_id;
        END IF;

    END LOOP;

    -- Financials
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
            RAISE EXCEPTION 'Insufficient funds in treasury for payment';
        END IF;
        
        UPDATE treasuries SET balance = balance - v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'expense', 'purchase_payment', 'Payment for Invoice #' || v_invoice.id, 'purchase_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    -- Supplier Balance (We Owe = Negative logic)
    -- Debt Increases by Remaining Amount. Balance becomes more negative.
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance - v_remaining_amount WHERE id = v_invoice.supplier_id;
    END IF;

    UPDATE purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 2. Void Purchase Invoice
CREATE OR REPLACE FUNCTION void_purchase_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
    v_current_qty NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'posted' THEN
        RAISE EXCEPTION 'Invoice is not posted';
    END IF;

    -- Revert Inventory
    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_current_qty := 0;
        
        -- Check Stock
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity INTO v_current_qty FROM raw_materials WHERE id = v_item.raw_material_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for raw material %', v_item.raw_material_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.raw_material_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity INTO v_current_qty FROM packaging_materials WHERE id = v_item.packaging_material_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for pkg material %', v_item.packaging_material_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.packaging_material_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity INTO v_current_qty FROM finished_products WHERE id = v_item.finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for product %', v_item.finished_product_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.finished_product_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity INTO v_current_qty FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for semi product %', v_item.semi_finished_product_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.semi_finished_product_id;
        END IF;
    END LOOP;

    -- Revert Financials
    -- 1. Refund Treasury (We get money back)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'income', 'purchase_void_refund', 'Refund for Voided Purchase Invoice #' || v_invoice.id, 'purchase_invoice', v_invoice.id::text, CURRENT_DATE);
    END IF;

    -- 2. Revert Party Balance
    -- Original: Subtracted remaining (Debt). Revert: Add remaining.
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.supplier_id;
    END IF;

    UPDATE purchase_invoices SET status = 'void' WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 3. Void Sales Invoice
CREATE OR REPLACE FUNCTION void_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'posted' THEN
        RAISE EXCEPTION 'Invoice is not posted';
    END IF;

    -- Revert Inventory (Return items to stock)
    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        IF v_item.item_type = 'raw_material' THEN
            UPDATE raw_materials SET quantity = quantity + v_item.quantity WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = quantity + v_item.quantity WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            UPDATE semi_finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item.semi_finished_product_id;
        END IF;
    END LOOP;

    -- Revert Financials
    -- 1. Refund Customer (We pay money back)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        -- Check we have funds to refund
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
             RAISE EXCEPTION 'Insufficient funds in treasury to refund customer';
        END IF;

        UPDATE treasuries SET balance = balance - v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'expense', 'sales_void_refund', 'Refund for Voided Sales Invoice #' || v_invoice.id, 'sales_invoice', v_invoice.id::text, CURRENT_DATE);
    END IF;

    -- 2. Revert Party Balance
    -- Original: Added remaining (Debt). Revert: Subtract remaining.
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance - v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'void' WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
