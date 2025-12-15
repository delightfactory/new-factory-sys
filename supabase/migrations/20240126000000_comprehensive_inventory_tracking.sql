-- ============================================================================
-- Migration: Comprehensive Inventory Movement Tracking
-- Date: 2025-12-15
-- Purpose: Add inventory_movements logging to ALL commercial operations
--          - Sales invoices (process + void)
--          - Purchase invoices (process + void)
--          - Sales returns (process)
--          - Purchase returns (process)
--          - Stocktaking reconciliation
-- 
-- UPDATE: Added DROP FUNCTION commands to avoid return type conflicts.
-- ============================================================================

-- Helper function to log inventory movements
CREATE OR REPLACE FUNCTION log_inventory_movement(
    p_item_id BIGINT,
    p_item_type TEXT,
    p_movement_type TEXT,
    p_quantity NUMERIC,
    p_reason TEXT,
    p_reference_id TEXT
) RETURNS VOID AS $$
DECLARE
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    v_table_name TEXT;
BEGIN
    -- Determine table and get current balance
    IF p_item_type = 'raw_materials' OR p_item_type = 'raw_material' THEN
        SELECT quantity INTO v_new_balance FROM raw_materials WHERE id = p_item_id;
        v_table_name := 'raw_materials';
    ELSIF p_item_type = 'packaging_materials' OR p_item_type = 'packaging_material' THEN
        SELECT quantity INTO v_new_balance FROM packaging_materials WHERE id = p_item_id;
        v_table_name := 'packaging_materials';
    ELSIF p_item_type = 'semi_finished_products' OR p_item_type = 'semi_finished' THEN
        SELECT quantity INTO v_new_balance FROM semi_finished_products WHERE id = p_item_id;
        v_table_name := 'semi_finished_products';
    ELSIF p_item_type = 'finished_products' OR p_item_type = 'finished_product' THEN
        SELECT quantity INTO v_new_balance FROM finished_products WHERE id = p_item_id;
        v_table_name := 'finished_products';
    ELSE
        RETURN; -- Unknown type, skip
    END IF;

    -- Calculate previous balance
    IF p_movement_type = 'in' THEN
        v_prev_balance := v_new_balance - p_quantity;
    ELSE
        -- 'out' or others
        v_prev_balance := v_new_balance + p_quantity;
    END IF;

    -- Insert movement record
    INSERT INTO inventory_movements (
        item_id, 
        item_type, 
        movement_type, 
        quantity, 
        previous_balance, 
        new_balance, 
        reason, 
        reference_id
    ) VALUES (
        p_item_id,
        v_table_name::item_type_enum,
        p_movement_type,
        p_quantity,
        v_prev_balance,
        v_new_balance,
        p_reason,
        p_reference_id
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ENHANCED: Process Purchase Invoice (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS process_purchase_invoice(BIGINT);

CREATE OR REPLACE FUNCTION process_purchase_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
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
BEGIN
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'draft' THEN
        RAISE EXCEPTION 'Invoice is already processed or voided';
    END IF;

    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        
        v_old_qty := 0; 
        v_old_cost := 0;
        v_item_id := NULL;

        -- Fetch current state based on type
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_old_qty, v_old_cost FROM raw_materials WHERE id = v_item_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_old_qty, v_old_cost FROM packaging_materials WHERE id = v_item_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_old_qty, v_old_cost FROM finished_products WHERE id = v_item_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_old_qty, v_old_cost FROM semi_finished_products WHERE id = v_item_id;
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
            UPDATE raw_materials SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            UPDATE packaging_materials SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            UPDATE finished_products SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            UPDATE semi_finished_products SET quantity = v_total_qty, unit_cost = v_new_cost, updated_at = NOW() WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
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

    -- Financials
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
            RAISE EXCEPTION 'Insufficient funds in treasury for payment';
        END IF;
        
        UPDATE treasuries SET balance = balance - v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'expense', 'purchase_payment', 'دفع فاتورة شراء #' || v_invoice.invoice_number, 'purchase_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    -- Supplier Balance
    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance - v_remaining_amount WHERE id = v_invoice.supplier_id;
    END IF;

    UPDATE purchase_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. ENHANCED: Void Purchase Invoice (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS void_purchase_invoice(BIGINT);

CREATE OR REPLACE FUNCTION void_purchase_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
    v_current_qty NUMERIC;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'posted' THEN
        RAISE EXCEPTION 'Invoice is not posted';
    END IF;

    -- Revert Inventory
    FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_current_qty := 0;
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            SELECT quantity INTO v_current_qty FROM raw_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for raw material %', v_item_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT quantity INTO v_current_qty FROM packaging_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for pkg material %', v_item_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT quantity INTO v_current_qty FROM finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for product %', v_item_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT quantity INTO v_current_qty FROM semi_finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'Cannot void: Low stock for semi product %', v_item_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'out',
                v_item.quantity,
                'إلغاء فاتورة شراء #' || v_invoice.invoice_number,
                'PI-VOID-' || p_invoice_id::TEXT
            );
        END IF;
    END LOOP;

    -- Revert Financials
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.supplier_id, v_invoice.paid_amount, 'income', 'purchase_void_refund', 'استرداد من إلغاء فاتورة شراء #' || v_invoice.invoice_number, 'purchase_invoice', v_invoice.id::text, CURRENT_DATE);
    END IF;

    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.supplier_id;
    END IF;

    UPDATE purchase_invoices SET status = 'void' WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. ENHANCED: Process Sales Invoice (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS process_sales_invoice(BIGINT);

CREATE OR REPLACE FUNCTION process_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_current_qty NUMERIC;
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
        
        IF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT quantity INTO v_current_qty FROM finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج #%', v_item_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            SELECT quantity INTO v_current_qty FROM raw_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للخامة #%', v_item_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT quantity INTO v_current_qty FROM packaging_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي لمادة التعبئة #%', v_item_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT quantity INTO v_current_qty FROM semi_finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج نصف المصنع #%', v_item_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
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

    -- Financials
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        UPDATE treasuries SET balance = balance + v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'income', 'sales_payment', 'تحصيل فاتورة بيع #' || v_invoice.invoice_number, 'sales_invoice', v_invoice.id::text, v_invoice.transaction_date);
    END IF;

    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance + v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'posted' WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. ENHANCED: Void Sales Invoice (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS void_sales_invoice(BIGINT);

CREATE OR REPLACE FUNCTION void_sales_invoice(p_invoice_id BIGINT) RETURNS JSONB AS $$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_remaining_amount NUMERIC;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
    
    IF v_invoice.status != 'posted' THEN
        RAISE EXCEPTION 'Invoice is not posted';
    END IF;

    -- Revert Inventory (Return items to stock)
    FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            UPDATE raw_materials SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            UPDATE packaging_materials SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            UPDATE finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            UPDATE semi_finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'in',
                v_item.quantity,
                'إلغاء فاتورة بيع #' || v_invoice.invoice_number,
                'SI-VOID-' || p_invoice_id::TEXT
            );
        END IF;
    END LOOP;

    -- Revert Financials
    IF v_invoice.paid_amount > 0 AND v_invoice.treasury_id IS NOT NULL THEN
        IF (SELECT balance FROM treasuries WHERE id = v_invoice.treasury_id) < v_invoice.paid_amount THEN
             RAISE EXCEPTION 'رصيد الخزينة غير كافي لاسترداد المبلغ للعميل';
        END IF;

        UPDATE treasuries SET balance = balance - v_invoice.paid_amount WHERE id = v_invoice.treasury_id;
        
        INSERT INTO financial_transactions (treasury_id, party_id, amount, transaction_type, category, description, reference_type, reference_id, transaction_date)
        VALUES (v_invoice.treasury_id, v_invoice.customer_id, v_invoice.paid_amount, 'expense', 'sales_void_refund', 'استرداد من إلغاء فاتورة بيع #' || v_invoice.invoice_number, 'sales_invoice', v_invoice.id::text, CURRENT_DATE);
    END IF;

    v_remaining_amount := v_invoice.total_amount - v_invoice.paid_amount;
    IF v_remaining_amount > 0 THEN
        UPDATE parties SET balance = balance - v_remaining_amount WHERE id = v_invoice.customer_id;
    END IF;

    UPDATE sales_invoices SET status = 'void' WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. ENHANCED: Process Purchase Return (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS process_purchase_return(BIGINT);

CREATE OR REPLACE FUNCTION process_purchase_return(p_return_id BIGINT) RETURNS VOID AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    SELECT * INTO v_return FROM purchase_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

    -- Reduce Stock (We returned items to supplier)
    FOR v_item IN SELECT * FROM purchase_return_items WHERE return_id = p_return_id LOOP
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            UPDATE raw_materials SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            UPDATE finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'out',
                v_item.quantity,
                'مرتجع شراء #' || COALESCE(v_return.return_number, v_return.id::TEXT),
                'PR-' || p_return_id::TEXT
            );
        END IF;
    END LOOP;

    -- Debit Supplier
    UPDATE parties SET balance = balance + v_return.total_amount WHERE id = v_return.supplier_id;

    UPDATE purchase_returns SET status = 'posted', updated_at = NOW() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. ENHANCED: Process Sales Return (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS process_sales_return(BIGINT);

CREATE OR REPLACE FUNCTION process_sales_return(p_return_id BIGINT) RETURNS VOID AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_item_id BIGINT;
    v_item_type_str TEXT;
BEGIN
    SELECT * INTO v_return FROM sales_returns WHERE id = p_return_id;
    IF v_return.status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;

    -- Increase Stock (Customer returned items to us)
    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            UPDATE raw_materials SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            UPDATE packaging_materials SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            UPDATE finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            UPDATE semi_finished_products SET quantity = quantity + v_item.quantity WHERE id = v_item_id;
        END IF;

        -- LOG MOVEMENT
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

    -- Credit Customer
    UPDATE parties SET balance = balance - v_return.total_amount WHERE id = v_return.customer_id;

    UPDATE sales_returns SET status = 'posted', updated_at = NOW() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 7. ENHANCED: Reconcile Inventory Session (with movement logging)
-- ============================================================================
DROP FUNCTION IF EXISTS reconcile_inventory_session(BIGINT);

CREATE OR REPLACE FUNCTION reconcile_inventory_session(p_session_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r_item RECORD;
  v_diff NUMERIC;
  v_item_type_str TEXT;
  v_movement_type TEXT;
  v_qty NUMERIC;
BEGIN
  -- Loop through all items in the session
  FOR r_item IN SELECT * FROM inventory_count_items WHERE session_id = p_session_id LOOP
    
    v_diff := r_item.counted_quantity - r_item.system_quantity;
    
    -- Map singular item_type to plural table name for logging
    IF r_item.item_type = 'raw_material' THEN v_item_type_str := 'raw_materials';
    ELSIF r_item.item_type = 'packaging_material' THEN v_item_type_str := 'packaging_materials';
    ELSIF r_item.item_type = 'semi_finished' THEN v_item_type_str := 'semi_finished_products';
    ELSIF r_item.item_type = 'finished_product' THEN v_item_type_str := 'finished_products';
    END IF;

    IF v_diff <> 0 THEN
      -- Determine movement
      IF v_diff > 0 THEN
          v_movement_type := 'in';
          v_qty := v_diff;
      ELSE
          v_movement_type := 'out';
          v_qty := ABS(v_diff);
      END IF;

      -- Update Stock
      CASE r_item.item_type
        WHEN 'raw_material' THEN
          UPDATE raw_materials SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'packaging_material' THEN
           UPDATE packaging_materials SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'semi_finished' THEN
           UPDATE semi_finished_products SET quantity = quantity + v_diff WHERE id = r_item.item_id;
        WHEN 'finished_product' THEN
           UPDATE finished_products SET quantity = quantity + v_diff WHERE id = r_item.item_id;
      END CASE;

      -- LOG MOVEMENT
      PERFORM log_inventory_movement(
          r_item.item_id,
          v_item_type_str,
          v_movement_type,
          v_qty,
          'تسوية جرد #' || p_session_id::TEXT,
          'INV-ADJ-' || p_session_id::TEXT
      );

    END IF;
    
  END LOOP;
  
  -- Mark as completed
  UPDATE inventory_count_sessions SET status = 'completed' WHERE id = p_session_id;
END;
$$;
