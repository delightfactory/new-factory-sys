-- RPC: Process Purchase Invoice (Fix Balance Logic: Negative = Credit)
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
    -- 1. Get Invoice
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    -- 2. Process Items (Stock & Cost Update)
    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        -- A. Raw Materials
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity, price_per_unit INTO v_old_qty, v_old_cost 
            FROM raw_materials WHERE id = v_item.raw_material_id;
            
            v_old_qty := COALESCE(v_old_qty, 0);
            v_old_cost := COALESCE(v_old_cost, 0);
            
            v_total_qty := v_old_qty + v_item.quantity;
            IF v_total_qty > 0 THEN
                v_new_cost := ((v_old_qty * v_old_cost) + (v_item.quantity * v_item.unit_price)) / v_total_qty;
            ELSE
                v_new_cost := v_item.unit_price;
            END IF;
            
            UPDATE raw_materials 
            SET quantity = quantity + v_item.quantity,
                price_per_unit = v_new_cost,
                updated_at = NOW()
            WHERE id = v_item.raw_material_id;
            
        -- B. Packaging Materials
        ELSIF v_item.item_type = 'packaging_material' THEN
             UPDATE packaging_materials
             SET quantity = quantity + v_item.quantity,
                 updated_at = NOW()
             WHERE id = v_item.packaging_material_id;

        -- C. Finished Products
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products 
            SET quantity = quantity + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.finished_product_id;
        
        -- D. Semi-Finished Products
        ELSIF v_item.item_type = 'semi_finished' THEN
             UPDATE semi_finished_products
             SET quantity = quantity + v_item.quantity,
                 updated_at = NOW()
             WHERE id = v_item.semi_finished_product_id;
        END IF;
    END LOOP;

    -- 3. Financial Transaction (If Paid)
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
            RAISE EXCEPTION 'Insufficient funds in treasury for payment';
        END IF;
        
        UPDATE treasuries 
        SET balance = balance - v_invoice.paid_amount 
        WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (
            treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date
        ) VALUES (
            v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'expense', 'purchase_payment',
            'Payment for Purchase Invoice #' || v_invoice.id, 'purchase_invoice', v_invoice.id::text, v_invoice.transaction_date
        );
    END IF;

    -- 4. Update Supplier Balance (Debt)
    -- Logic Fix: Negative = Credit (We Owe).
    -- Remaining Amount implies we owe MORE. So we SUBTRACT from balance.
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties 
        SET balance = balance - v_remaining_amount -- Subtract to increase Debt (Negative direction)
        WHERE id = v_invoice.supplier_id;
    END IF;

    -- 5. Mark as Posted
    UPDATE purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
