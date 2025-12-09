-- Migration: Clean and Recreate Financial Functions standardizing on unit_cost

-- 1. DROP ALL Existing Variants to ensure clean state
DROP FUNCTION IF EXISTS process_purchase_invoice(INT);
DROP FUNCTION IF EXISTS process_purchase_invoice(BIGINT);
DROP FUNCTION IF EXISTS process_sales_invoice(INT);
DROP FUNCTION IF EXISTS process_sales_invoice(BIGINT);
DROP FUNCTION IF EXISTS process_purchase_return(INT);
DROP FUNCTION IF EXISTS process_purchase_return(BIGINT);
DROP FUNCTION IF EXISTS process_sales_return(INT);
DROP FUNCTION IF EXISTS process_sales_return(BIGINT);

-- 2. Re-Create Process Purchase Invoice (Robust WACO using unit_cost)
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

        -- Fetch current state based on type (Using unit_cost)
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost FROM raw_materials WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost FROM packaging_materials WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost FROM finished_products WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity, unit_cost INTO v_old_qty, v_old_cost FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
        END IF;

        v_old_qty := COALESCE(v_old_qty, 0);
        v_old_cost := COALESCE(v_old_cost, 0);
        
        -- Calculate WACO
        v_total_qty := v_old_qty + v_item.quantity;
        
        -- Safety: Ensure unit_price is not null
        IF v_item.unit_price IS NULL THEN v_item.unit_price := 0; END IF;

        IF v_total_qty > 0 THEN
            v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_item.unit_price)) / v_total_qty;
        ELSE
            v_new_cost := v_item.unit_price;
        END IF;

        -- Update Stock & Cost (Updating unit_cost)
        IF v_item.item_type = 'raw_material' THEN
            UPDATE raw_materials SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            UPDATE semi_finished_products SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item.semi_finished_product_id;
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

    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance - v_remaining_amount WHERE id = v_invoice.supplier_id;
    END IF;

    UPDATE purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 3. Re-Create Process Purchase Return (Reverse WACO using unit_cost)
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

        -- Get Current State (Using unit_cost)
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM raw_materials WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM packaging_materials WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM finished_products WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
        END IF;

        v_current_qty := COALESCE(v_current_qty, 0);
        v_current_cost := COALESCE(v_current_cost, 0);

        IF v_current_qty < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock to return (Item Type: %, ID: %)', v_item.item_type, v_item.id;
        END IF;

        -- Reverse WACO
        v_total_value := v_current_qty * v_current_cost;
        v_return_value := v_item.quantity * v_item.unit_price;
        
        v_new_qty := v_current_qty - v_item.quantity;
        
        IF v_new_qty > 0 THEN
            v_new_cost := (v_total_value - v_return_value) / v_new_qty;
             IF v_new_cost < 0 THEN v_new_cost := 0; END IF;
        ELSE
            v_new_cost := 0;
        END IF;

        -- Update Stock & Cost (Updating unit_cost)
        IF v_item.item_type = 'raw_material' THEN
            UPDATE raw_materials SET quantity = v_new_qty, unit_cost = v_new_cost WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = v_new_qty, unit_cost = v_new_cost WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = v_new_qty, unit_cost = v_new_cost WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
             UPDATE semi_finished_products SET quantity = v_new_qty, unit_cost = v_new_cost WHERE id = v_item.semi_finished_product_id;
        END IF;

    END LOOP;

    UPDATE parties SET balance = balance + v_return.total_amount WHERE id = v_return.supplier_id;
    UPDATE purchase_returns SET status = 'posted' WHERE id = p_return_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 4. Re-Create Process Sales Invoice (Standard)
CREATE OR REPLACE FUNCTION process_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
    v_current_qty NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed';
    END IF;

    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- Check Stock
        v_current_qty := 0;
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity INTO v_current_qty FROM raw_materials WHERE id = v_item.raw_material_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for raw material %', v_item.raw_material_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
             SELECT quantity INTO v_current_qty FROM packaging_materials WHERE id = v_item.packaging_material_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for pkg material %', v_item.packaging_material_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
             SELECT quantity INTO v_current_qty FROM finished_products WHERE id = v_item.finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_item.finished_product_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
             SELECT quantity INTO v_current_qty FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for semi product %', v_item.semi_finished_product_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.semi_finished_product_id;
        END IF;

    END LOOP;

    -- Financials (Income)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'income', 'sales_payment', 'Payment for Invoice #' || v_invoice.id, 'sales_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    -- Customer Balance
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 5. Re-Create Process Sales Return (Standard add-back)
CREATE OR REPLACE FUNCTION process_sales_return(p_return_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
BEGIN
    SELECT * INTO v_return FROM sales_returns WHERE id = p_return_id;
    
    IF v_return.status != 'draft' THEN
        RAISE EXCEPTION 'Return is already processed';
    END IF;

    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        
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

    -- Sales Return -> Decrease Customer Balance
    UPDATE parties SET balance = balance - v_return.total_amount WHERE id = v_return.customer_id;

    UPDATE sales_returns SET status = 'posted' WHERE id = p_return_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
