-- Migration: Financial P&L Support (COGS Tracking)

-- 1. Add unit_cost to Sales Items (To capture COGS at time of sale)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_invoice_items' AND column_name = 'unit_cost_at_sale') THEN
        ALTER TABLE sales_invoice_items ADD COLUMN unit_cost_at_sale NUMERIC DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_return_items' AND column_name = 'unit_cost_at_return') THEN
        ALTER TABLE sales_return_items ADD COLUMN unit_cost_at_return NUMERIC DEFAULT 0;
    END IF;
END $$;

-- 2. Update process_sales_invoice to capture WACO
CREATE OR REPLACE FUNCTION process_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
    v_current_qty NUMERIC;
    v_current_cost NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed';
    END IF;

    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- Default vars
        v_current_qty := 0;
        v_current_cost := 0;

        -- Check Stock and Get Cost
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM raw_materials WHERE id = v_item.raw_material_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for raw material %', v_item.raw_material_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.raw_material_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
             SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM packaging_materials WHERE id = v_item.packaging_material_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for pkg material %', v_item.packaging_material_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity WHERE id = v_item.packaging_material_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
             SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM finished_products WHERE id = v_item.finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_item.finished_product_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.finished_product_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
             SELECT quantity, unit_cost INTO v_current_qty, v_current_cost FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
             IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Insufficient stock for semi product %', v_item.semi_finished_product_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item.semi_finished_product_id;
        END IF;

        -- Capture Cost (COGS)
        UPDATE sales_invoice_items SET unit_cost_at_sale = COALESCE(v_current_cost, 0) WHERE id = v_item.id;

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

-- 3. Update process_sales_return (Capture Cost of Return)
CREATE OR REPLACE FUNCTION process_sales_return(p_return_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_cost_to_return NUMERIC;
BEGIN
    SELECT * INTO v_return FROM sales_returns WHERE id = p_return_id;
    
    IF v_return.status != 'draft' THEN
        RAISE EXCEPTION 'Return is already processed';
    END IF;

    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        
        -- Logic: If we could link to original invoice item, use that cost. 
        -- Limit: complex to link item-to-item directly in SQL without explicit link.
        -- Fallback: Use Current WACO or Input Price?
        -- For P&L, we want to reverse the COGS. 
        -- PROPOSAL: Use the unit_cost sent from Frontend (which we implemented to fetch from Invoice!).
        -- Frontend fills 'unit_price', but 'unit_cost' isn't filled by frontend (it's hidden).
        
        -- Refinement: Fetch current cost from inventory as "Restocking Value".
        v_cost_to_return := 0;
        
        IF v_item.item_type = 'raw_material' THEN
            SELECT unit_cost INTO v_cost_to_return FROM raw_materials WHERE id = v_item.raw_material_id;
            UPDATE raw_materials SET quantity = quantity + v_item.quantity WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT unit_cost INTO v_cost_to_return FROM packaging_materials WHERE id = v_item.packaging_material_id;
            UPDATE packaging_materials SET quantity = quantity + v_item.quantity WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT unit_cost INTO v_cost_to_return FROM finished_products WHERE id = v_item.finished_product_id;
            UPDATE finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT unit_cost INTO v_cost_to_return FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
            UPDATE semi_finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item.semi_finished_product_id;
        END IF;

        -- Capture the Cost
        UPDATE sales_return_items SET unit_cost_at_return = COALESCE(v_cost_to_return, 0) WHERE id = v_item.id;

    END LOOP;

    -- Sales Return -> Decrease Customer Balance
    UPDATE parties SET balance = balance - v_return.total_amount WHERE id = v_return.customer_id;

    UPDATE sales_returns SET status = 'posted' WHERE id = p_return_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
