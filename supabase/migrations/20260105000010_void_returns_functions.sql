-- ============================================================================
-- Migration: Add Void Functions for Returns
-- Date: 2026-01-05
-- Purpose: Add ability to void (cancel) processed returns
-- 
-- RISK LEVEL: 🟢 ZERO - New functions only, no existing logic changed
-- 
-- Functions Added:
--   1. void_purchase_return(p_return_id) - Cancel a posted purchase return
--   2. void_sales_return(p_return_id) - Cancel a posted sales return
--
-- Logic:
--   - Reverse all inventory movements
--   - Reverse party balance updates
--   - Log all movements for audit trail
--   - Mark return as 'void'
-- ============================================================================

-- ============================================================================
-- 1. VOID PURCHASE RETURN
-- ============================================================================
-- عكس عملية مرتجع الشراء:
-- - المرتجع الأصلي: أخرجنا البضاعة من المخزون (أرجعناها للمورد)
-- - الإلغاء: نُعيد البضاعة للمخزون
-- - المرتجع الأصلي: زاد رصيدنا عند المورد (أصبحوا مدينين لنا)
-- - الإلغاء: ننقص رصيدنا عند المورد
-- ============================================================================

CREATE OR REPLACE FUNCTION void_purchase_return(p_return_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_item_id BIGINT;
    v_item_type_str TEXT;
    v_return_number TEXT;
BEGIN
    -- 1. Get Return Data
    SELECT * INTO v_return FROM purchase_returns WHERE id = p_return_id;
    
    IF v_return IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرتجع غير موجود');
    END IF;
    
    IF v_return.status != 'posted' THEN
        RETURN jsonb_build_object('success', false, 'message', 'لا يمكن إلغاء مرتجع غير معالج');
    END IF;
    
    v_return_number := COALESCE(v_return.return_number, 'PR-' || p_return_id::TEXT);

    -- 2. Reverse Inventory: Add items back to stock 
    -- (المرتجع الأصلي أخرجها، الإلغاء يُعيدها)
    FOR v_item IN SELECT * FROM purchase_return_items WHERE return_id = p_return_id LOOP
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            UPDATE raw_materials 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            UPDATE packaging_materials 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            UPDATE finished_products 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            UPDATE semi_finished_products 
            SET quantity = quantity + v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
        END IF;

        -- Log Movement (IN - items returning to our stock)
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'in',
                v_item.quantity,
                'إلغاء مرتجع شراء #' || v_return_number,
                'PR-VOID-' || p_return_id::TEXT
            );
        END IF;
    END LOOP;

    -- 3. Reverse Party Balance
    -- المرتجع الأصلي: أضاف للرصيد (المورد أصبح مديناً لنا)
    -- الإلغاء: ننقص من الرصيد (نعود للحالة السابقة)
    UPDATE parties 
    SET balance = balance - v_return.total_amount 
    WHERE id = v_return.supplier_id;

    -- 4. Mark as Void
    UPDATE purchase_returns 
    SET status = 'void', updated_at = NOW() 
    WHERE id = p_return_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم إلغاء مرتجع الشراء بنجاح'
    );
END;
$$;

COMMENT ON FUNCTION void_purchase_return(BIGINT) IS 
'Voids a posted purchase return: adds items back to inventory, reverses supplier balance update, and marks as void.';


-- ============================================================================
-- 2. VOID SALES RETURN
-- ============================================================================
-- عكس عملية مرتجع البيع:
-- - المرتجع الأصلي: أدخلنا البضاعة للمخزون (العميل أرجعها لنا)
-- - الإلغاء: نُخرج البضاعة من المخزون
-- - المرتجع الأصلي: نقصنا رصيد العميل (قللنا ما يدين لنا به)
-- - الإلغاء: نزيد رصيد العميل (يعود مديناً لنا)
-- ============================================================================

CREATE OR REPLACE FUNCTION void_sales_return(p_return_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_return RECORD;
    v_item RECORD;
    v_item_id BIGINT;
    v_item_type_str TEXT;
    v_current_qty NUMERIC;
    v_return_number TEXT;
BEGIN
    -- 1. Get Return Data
    SELECT * INTO v_return FROM sales_returns WHERE id = p_return_id;
    
    IF v_return IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'المرتجع غير موجود');
    END IF;
    
    IF v_return.status != 'posted' THEN
        RETURN jsonb_build_object('success', false, 'message', 'لا يمكن إلغاء مرتجع غير معالج');
    END IF;
    
    v_return_number := COALESCE(v_return.return_number, 'SR-' || p_return_id::TEXT);

    -- 2. Check Stock Before Deducting (Safety Check)
    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        v_current_qty := 0;
        
        IF v_item.item_type = 'raw_material' THEN
            SELECT quantity INTO v_current_qty FROM raw_materials WHERE id = v_item.raw_material_id;
        ELSIF v_item.item_type = 'packaging_material' THEN
            SELECT quantity INTO v_current_qty FROM packaging_materials WHERE id = v_item.packaging_material_id;
        ELSIF v_item.item_type = 'finished_product' THEN
            SELECT quantity INTO v_current_qty FROM finished_products WHERE id = v_item.finished_product_id;
        ELSIF v_item.item_type = 'semi_finished' THEN
            SELECT quantity INTO v_current_qty FROM semi_finished_products WHERE id = v_item.semi_finished_product_id;
        END IF;
        
        IF COALESCE(v_current_qty, 0) < v_item.quantity THEN
            RETURN jsonb_build_object(
                'success', false, 
                'message', 'رصيد المخزون غير كافٍ لإلغاء المرتجع - قد يكون المنتج بيع أو استُهلك'
            );
        END IF;
    END LOOP;

    -- 3. Reverse Inventory: Remove items from stock
    -- (المرتجع الأصلي أدخلها، الإلغاء يُخرجها)
    FOR v_item IN SELECT * FROM sales_return_items WHERE return_id = p_return_id LOOP
        v_item_id := NULL;
        
        IF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            UPDATE raw_materials 
            SET quantity = quantity - v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            UPDATE packaging_materials 
            SET quantity = quantity - v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            UPDATE finished_products 
            SET quantity = quantity - v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
            
        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            UPDATE semi_finished_products 
            SET quantity = quantity - v_item.quantity, updated_at = NOW() 
            WHERE id = v_item_id;
        END IF;

        -- Log Movement (OUT - items leaving our stock)
        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id,
                v_item_type_str,
                'out',
                v_item.quantity,
                'إلغاء مرتجع بيع #' || v_return_number,
                'SR-VOID-' || p_return_id::TEXT
            );
        END IF;
    END LOOP;

    -- 4. Reverse Party Balance
    -- المرتجع الأصلي: نقص من رصيد العميل
    -- الإلغاء: نزيد رصيد العميل (يعود مديناً لنا)
    UPDATE parties 
    SET balance = balance + v_return.total_amount 
    WHERE id = v_return.customer_id;

    -- 5. Mark as Void
    UPDATE sales_returns 
    SET status = 'void', updated_at = NOW() 
    WHERE id = p_return_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'تم إلغاء مرتجع البيع بنجاح'
    );
END;
$$;

COMMENT ON FUNCTION void_sales_return(BIGINT) IS 
'Voids a posted sales return: removes items from inventory (with stock check), reverses customer balance update, and marks as void.';
