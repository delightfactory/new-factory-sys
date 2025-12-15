-- Atomic Operations for Production and Packaging (Completion & Cancellation)
-- Replaces client-side orchestration with safe server-side transactions.

-- ==========================================
-- 1. Complete Production Order Atomic
-- ==========================================
CREATE OR REPLACE FUNCTION complete_production_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_ingredient RECORD;
    v_order_code TEXT;
    v_recipe_batch_size NUMERIC;
    v_ratio NUMERIC;
    v_qty_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Get Order Code
    SELECT code INTO v_order_code FROM production_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PO-' || p_order_id::TEXT; END IF;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP
        
        -- Get Recipe Details
        SELECT recipe_batch_size INTO v_recipe_batch_size 
        FROM semi_finished_products 
        WHERE id = r_item.semi_finished_id;

        IF v_recipe_batch_size IS NULL OR v_recipe_batch_size = 0 THEN v_recipe_batch_size := 100; END IF;
        v_ratio := r_item.quantity / v_recipe_batch_size;

        -- Deduct Raw Materials (Ingredients)
        FOR r_ingredient IN 
            SELECT * FROM semi_finished_ingredients WHERE semi_finished_id = r_item.semi_finished_id 
        LOOP
            v_qty_needed := r_ingredient.quantity * v_ratio;

            SELECT quantity INTO v_prev_balance FROM raw_materials WHERE id = r_ingredient.raw_material_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_qty_needed;

            UPDATE raw_materials SET quantity = v_new_balance WHERE id = r_ingredient.raw_material_id;

            PERFORM log_inventory_movement(
                r_ingredient.raw_material_id, 'raw_materials', 'out', v_qty_needed, 
                'استهلاك في أمر إنتاج', v_order_code
            );
        END LOOP;

        -- Add Semi-Finished Product
        SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = r_item.semi_finished_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        v_new_balance := v_prev_balance + r_item.quantity;

        UPDATE semi_finished_products SET quantity = v_new_balance WHERE id = r_item.semi_finished_id;

        PERFORM log_inventory_movement(
            r_item.semi_finished_id, 'semi_finished_products', 'in', r_item.quantity, 
            'إنتاج من أمر تشغيل', v_order_code
        );
    END LOOP;

    -- Update Order Status
    UPDATE production_orders SET status = 'completed' WHERE id = p_order_id;
END;
$$;


-- ==========================================
-- 2. Complete Packaging Order Atomic
-- ==========================================
CREATE OR REPLACE FUNCTION complete_packaging_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_pkg RECORD;
    v_order_code TEXT;
    v_sf_id BIGINT;
    v_sf_qty_per_unit NUMERIC;
    v_sf_needed NUMERIC;
    v_pkg_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Get Order Code
    SELECT code INTO v_order_code FROM packaging_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PKG-' || p_order_id::TEXT; END IF;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM packaging_order_items WHERE packaging_order_id = p_order_id LOOP
        
        -- Get Finished Product Details
        SELECT semi_finished_id, semi_finished_quantity 
        INTO v_sf_id, v_sf_qty_per_unit
        FROM finished_products 
        WHERE id = r_item.finished_product_id;

        -- Deduct Semi-Finished
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            v_sf_needed := r_item.quantity * v_sf_qty_per_unit;

            SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = v_sf_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_sf_needed;

            UPDATE semi_finished_products SET quantity = v_new_balance WHERE id = v_sf_id;

            PERFORM log_inventory_movement(
                v_sf_id, 'semi_finished_products', 'out', v_sf_needed, 
                'استهلاك في أمر تعبئة', v_order_code
            );
        END IF;

        -- Deduct Packaging Materials
        FOR r_pkg IN 
            SELECT * FROM finished_product_packaging WHERE finished_product_id = r_item.finished_product_id
        LOOP
            v_pkg_needed := r_item.quantity * r_pkg.quantity;

            SELECT quantity INTO v_prev_balance FROM packaging_materials WHERE id = r_pkg.packaging_material_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_pkg_needed;

            UPDATE packaging_materials SET quantity = v_new_balance WHERE id = r_pkg.packaging_material_id;

            PERFORM log_inventory_movement(
                r_pkg.packaging_material_id, 'packaging_materials', 'out', v_pkg_needed, 
                'استهلاك في أمر تعبئة', v_order_code
            );
        END LOOP;

        -- Add Finished Product
        SELECT quantity INTO v_prev_balance FROM finished_products WHERE id = r_item.finished_product_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        v_new_balance := v_prev_balance + r_item.quantity;

        UPDATE finished_products SET quantity = v_new_balance WHERE id = r_item.finished_product_id;

        PERFORM log_inventory_movement(
            r_item.finished_product_id, 'finished_products', 'in', r_item.quantity, 
            'إنتاج تعبئة وتغليف', v_order_code
        );
    END LOOP;

    -- Update Order Status
    UPDATE packaging_orders SET status = 'completed' WHERE id = p_order_id;
END;
$$;


-- ==========================================
-- 3. Cancel Production Order Atomic
-- ==========================================
CREATE OR REPLACE FUNCTION cancel_production_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_ingredient RECORD;
    v_order_code TEXT;
    v_recipe_batch_size NUMERIC;
    v_ratio NUMERIC;
    v_qty_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    SELECT code INTO v_order_code FROM production_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PO-' || p_order_id::TEXT; END IF;

    -- Loop Items
    FOR r_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP
        
        -- A. Remove Semi-Finished (Reverse of Completion)
        SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = r_item.semi_finished_id;
        v_new_balance := v_prev_balance - r_item.quantity; -- Decrement

        UPDATE semi_finished_products SET quantity = v_new_balance WHERE id = r_item.semi_finished_id;

        PERFORM log_inventory_movement(
            r_item.semi_finished_id, 'semi_finished_products', 'out', r_item.quantity, 
            'إلغاء إنتاج (عكس الحركة)', v_order_code
        );

        -- B. Add Back Raw Materials
        SELECT recipe_batch_size INTO v_recipe_batch_size 
        FROM semi_finished_products 
        WHERE id = r_item.semi_finished_id;
        
        IF v_recipe_batch_size IS NULL OR v_recipe_batch_size = 0 THEN v_recipe_batch_size := 100; END IF;
        v_ratio := r_item.quantity / v_recipe_batch_size;

        FOR r_ingredient IN 
            SELECT * FROM semi_finished_ingredients WHERE semi_finished_id = r_item.semi_finished_id 
        LOOP
            v_qty_needed := r_ingredient.quantity * v_ratio;

            SELECT quantity INTO v_prev_balance FROM raw_materials WHERE id = r_ingredient.raw_material_id;
            v_new_balance := v_prev_balance + v_qty_needed; -- Increment

            UPDATE raw_materials SET quantity = v_new_balance WHERE id = r_ingredient.raw_material_id;

            PERFORM log_inventory_movement(
                r_ingredient.raw_material_id, 'raw_materials', 'in', v_qty_needed, 
                'استرجاع مواد خام (إلغاء إنتاج)', v_order_code
            );
        END LOOP;
    END LOOP;

    UPDATE production_orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;


-- ==========================================
-- 4. Cancel Packaging Order Atomic
-- ==========================================
CREATE OR REPLACE FUNCTION cancel_packaging_order_atomic(p_order_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r_item RECORD;
    r_pkg RECORD;
    v_order_code TEXT;
    v_sf_id BIGINT;
    v_sf_qty_per_unit NUMERIC;
    v_sf_needed NUMERIC;
    v_pkg_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    SELECT code INTO v_order_code FROM packaging_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PKG-' || p_order_id::TEXT; END IF;

    -- Loop Items
    FOR r_item IN SELECT * FROM packaging_order_items WHERE packaging_order_id = p_order_id LOOP
        
        -- A. Remove Finished Product
        SELECT quantity INTO v_prev_balance FROM finished_products WHERE id = r_item.finished_product_id;
        v_new_balance := v_prev_balance - r_item.quantity; -- Decrement

        UPDATE finished_products SET quantity = v_new_balance WHERE id = r_item.finished_product_id;

        PERFORM log_inventory_movement(
            r_item.finished_product_id, 'finished_products', 'out', r_item.quantity, 
            'إلغاء تعبئة (عكس الحركة)', v_order_code
        );

        -- B. Add Back Components
        SELECT semi_finished_id, semi_finished_quantity 
        INTO v_sf_id, v_sf_qty_per_unit
        FROM finished_products 
        WHERE id = r_item.finished_product_id;

        -- Add Back Semi-Finished
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            v_sf_needed := r_item.quantity * v_sf_qty_per_unit;

            SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = v_sf_id;
            v_new_balance := v_prev_balance + v_sf_needed; -- Increment

            UPDATE semi_finished_products SET quantity = v_new_balance WHERE id = v_sf_id;

            PERFORM log_inventory_movement(
                v_sf_id, 'semi_finished_products', 'in', v_sf_needed, 
                'استرجاع نصف مصنع (إلغاء تعبئة)', v_order_code
            );
        END IF;

        -- Add Back Packaging Materials
        FOR r_pkg IN 
            SELECT * FROM finished_product_packaging WHERE finished_product_id = r_item.finished_product_id
        LOOP
            v_pkg_needed := r_item.quantity * r_pkg.quantity;

            SELECT quantity INTO v_prev_balance FROM packaging_materials WHERE id = r_pkg.packaging_material_id;
            v_new_balance := v_prev_balance + v_pkg_needed; -- Increment

            UPDATE packaging_materials SET quantity = v_new_balance WHERE id = r_pkg.packaging_material_id;

            PERFORM log_inventory_movement(
                r_pkg.packaging_material_id, 'packaging_materials', 'in', v_pkg_needed, 
                'استرجاع مواد تعبئة (إلغاء تعبئة)', v_order_code
            );
        END LOOP;
    END LOOP;

    UPDATE packaging_orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;
