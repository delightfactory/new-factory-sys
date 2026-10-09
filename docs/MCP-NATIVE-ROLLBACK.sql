-- LOCAL REVIEWED RECOVERY SCRIPT ONLY. NEVER run before operator approval.
-- Requires the live preflight snapshot still match MCP-NATIVE-ROLLBACK-SNAPSHOT.json.
-- FIRST stop MCP traffic and disable/delete this exact OAuth client at the
-- provider, revoke its consent/grants/sessions, and confirm issuance/refresh
-- deny. Business-policy revocation alone is insufficient before hook removal.
-- ONLY THEN restore the prior Auth hook setting in the owner dashboard;
-- disable the gateway login and terminate its own sessions in an owner channel.
-- Preserve audit receipts and business data. No DROP CASCADE / Auth restore.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
UPDATE factory_private.mcp_access SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL;
UPDATE factory_mcp_auth.static_clients SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('factory_write','factory_mcp_context','factory_mcp_write','factory_mcp_query','factory_mcp_schema','factory_mcp_analyze','factory_mcp_consent_request','factory_mcp_consent_admit')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,factory_mcp_gateway',f.identity); END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.complete_packaging_order_atomic(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
    -- WACO Variables (NEW)
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    v_semi_cost NUMERIC;
    v_pack_cost NUMERIC;
    v_item_cost NUMERIC;
    v_total_cost NUMERIC := 0;
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

        -- =====================================================================
        -- Calculate Item Cost (WACO Enhancement)
        -- Cost = (Semi-Finished Qty × Cost) + Sum(Packaging Qty × Cost)
        -- =====================================================================

        -- 1. Semi-Finished Cost Component
        v_semi_cost := 0;
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            SELECT COALESCE(v_sf_qty_per_unit * sfp.unit_cost, 0) INTO v_semi_cost
            FROM semi_finished_products sfp
            WHERE sfp.id = v_sf_id;
        END IF;

        -- 2. Packaging Materials Cost Component
        SELECT COALESCE(SUM(fpp.quantity * pm.unit_cost), 0) INTO v_pack_cost
        FROM finished_product_packaging fpp
        JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
        WHERE fpp.finished_product_id = r_item.finished_product_id;

        -- Total item cost = semi-finished cost + packaging cost
        v_item_cost := COALESCE(v_semi_cost, 0) + COALESCE(v_pack_cost, 0);

        -- Deduct Semi-Finished
        IF v_sf_id IS NOT NULL AND v_sf_qty_per_unit IS NOT NULL THEN
            v_sf_needed := r_item.quantity * v_sf_qty_per_unit;

            SELECT quantity INTO v_prev_balance FROM semi_finished_products WHERE id = v_sf_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_sf_needed;

            UPDATE semi_finished_products
            SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = v_sf_id;

            PERFORM log_inventory_movement(
                v_sf_id, 'semi_finished_products', 'out', v_sf_needed,
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
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

            UPDATE packaging_materials
            SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = r_pkg.packaging_material_id;

            PERFORM log_inventory_movement(
                r_pkg.packaging_material_id, 'packaging_materials', 'out', v_pkg_needed,
                'استهلاك في أمر تعبئة #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost
        FROM finished_products WHERE id = r_item.finished_product_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;

        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Finished Product (Enhancement)
        -- New Cost = (Old Qty × Old Cost + New Qty × New Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_cost;
        END IF;

        -- Update Finished Product with quantity AND cost
        UPDATE finished_products
        SET quantity = v_new_balance,
            unit_cost = v_new_cost,
            updated_at = NOW()
        WHERE id = r_item.finished_product_id;

        PERFORM log_inventory_movement(
            r_item.finished_product_id, 'finished_products', 'in', r_item.quantity,
            'إنتاج تعبئة وتغليف #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost (Enhancement)
        -- =====================================================================
        UPDATE packaging_order_items
        SET unit_cost = v_item_cost,
            total_cost = r_item.quantity * v_item_cost
        WHERE id = r_item.id;

        v_total_cost := v_total_cost + (r_item.quantity * v_item_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost (Enhancement)
    -- =====================================================================
    UPDATE packaging_orders
    SET status = 'completed',
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$function$;

ALTER FUNCTION public.complete_packaging_order_atomic(bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.complete_packaging_order_atomic(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_packaging_order_atomic(bigint) TO PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_production_order_atomic(p_order_id bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    r_item RECORD;
    r_ingredient RECORD;
    v_order_code TEXT;
    v_recipe_batch_size NUMERIC;
    v_ratio NUMERIC;
    v_qty_needed NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
    v_prev_cost NUMERIC;
    v_new_cost NUMERIC;
    -- WACO Variables
    v_batch_cost NUMERIC;      -- Total cost for one batch (recipe_batch_size units)
    v_item_unit_cost NUMERIC;  -- Cost per single unit of semi-finished product
    v_total_order_cost NUMERIC := 0;
BEGIN
    -- Get Order Code
    SELECT code INTO v_order_code FROM production_orders WHERE id = p_order_id;
    IF v_order_code IS NULL THEN v_order_code := 'PO-' || p_order_id::TEXT; END IF;

    -- Loop through Order Items
    FOR r_item IN SELECT * FROM production_order_items WHERE production_order_id = p_order_id LOOP

        -- Get Recipe Details (batch size)
        SELECT recipe_batch_size INTO v_recipe_batch_size
        FROM semi_finished_products
        WHERE id = r_item.semi_finished_id;

        -- Handle NULL or zero batch size
        IF v_recipe_batch_size IS NULL OR v_recipe_batch_size = 0 THEN
            v_recipe_batch_size := 100;
        END IF;

        -- Calculate ratio: how many batches are we producing
        v_ratio := r_item.quantity / v_recipe_batch_size;

        -- =====================================================================
        -- Calculate UNIT COST from Raw Materials (CORRECTED)
        --
        -- si.quantity = amount of raw material for ONE batch (recipe_batch_size)
        -- rm.unit_cost = cost per unit of raw material
        --
        -- v_batch_cost = Total cost of raw materials for ONE batch
        -- v_item_unit_cost = Cost per SINGLE UNIT of semi-finished product
        -- =====================================================================
        SELECT COALESCE(SUM(rm.unit_cost * si.quantity), 0) INTO v_batch_cost
        FROM semi_finished_ingredients si
        JOIN raw_materials rm ON si.raw_material_id = rm.id
        WHERE si.semi_finished_id = r_item.semi_finished_id;

        -- Unit cost = batch cost / batch size
        v_item_unit_cost := v_batch_cost / v_recipe_batch_size;

        -- Deduct Raw Materials (Ingredients)
        FOR r_ingredient IN
            SELECT * FROM semi_finished_ingredients WHERE semi_finished_id = r_item.semi_finished_id
        LOOP
            -- Amount needed = ingredient quantity per batch * number of batches
            v_qty_needed := r_ingredient.quantity * v_ratio;

            SELECT quantity INTO v_prev_balance FROM raw_materials WHERE id = r_ingredient.raw_material_id;
            IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
            v_new_balance := v_prev_balance - v_qty_needed;

            UPDATE raw_materials SET quantity = v_new_balance, updated_at = NOW()
            WHERE id = r_ingredient.raw_material_id;

            PERFORM log_inventory_movement(
                r_ingredient.raw_material_id, 'raw_materials', 'out', v_qty_needed,
                'استهلاك في أمر إنتاج #' || v_order_code, v_order_code
            );
        END LOOP;

        -- Get current semi-finished product quantity and cost
        SELECT quantity, COALESCE(unit_cost, 0) INTO v_prev_balance, v_prev_cost
        FROM semi_finished_products WHERE id = r_item.semi_finished_id;
        IF v_prev_balance IS NULL THEN v_prev_balance := 0; END IF;
        IF v_prev_cost IS NULL THEN v_prev_cost := 0; END IF;

        v_new_balance := v_prev_balance + r_item.quantity;

        -- =====================================================================
        -- Calculate WACO for Semi-Finished Product
        -- New Avg Cost = (Old Qty × Old Cost + New Qty × New Unit Cost) / Total Qty
        -- =====================================================================
        IF v_new_balance > 0 THEN
            v_new_cost := ((v_prev_balance * v_prev_cost) + (r_item.quantity * v_item_unit_cost)) / v_new_balance;
        ELSE
            v_new_cost := v_item_unit_cost;
        END IF;

        -- Update Semi-Finished Product with quantity AND cost
        UPDATE semi_finished_products
        SET quantity = v_new_balance,
            unit_cost = v_new_cost,
            updated_at = NOW()
        WHERE id = r_item.semi_finished_id;

        PERFORM log_inventory_movement(
            r_item.semi_finished_id, 'semi_finished_products', 'in', r_item.quantity,
            'إنتاج من أمر تشغيل #' || v_order_code, v_order_code
        );

        -- =====================================================================
        -- Update Order Item with Cost
        -- unit_cost = cost per unit, total_cost = unit_cost * quantity
        -- =====================================================================
        UPDATE production_order_items
        SET unit_cost = v_item_unit_cost,
            total_cost = r_item.quantity * v_item_unit_cost
        WHERE id = r_item.id;

        v_total_order_cost := v_total_order_cost + (r_item.quantity * v_item_unit_cost);
    END LOOP;

    -- =====================================================================
    -- Update Order with Total Cost
    -- =====================================================================
    UPDATE production_orders
    SET status = 'completed',
        total_cost = v_total_order_cost,
        updated_at = NOW()
    WHERE id = p_order_id;
END;
$function$;

ALTER FUNCTION public.complete_production_order_atomic(bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.complete_production_order_atomic(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_production_order_atomic(bigint) TO PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_sales_invoice(p_invoice_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_invoice RECORD;
    v_item RECORD;
    v_current_qty NUMERIC;
    v_current_cost NUMERIC;
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
        v_current_cost := 0;

        IF v_item.item_type = 'finished_product' THEN
            v_item_id := v_item.finished_product_id;
            v_item_type_str := 'finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج #%', v_item_id; END IF;
            UPDATE finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'raw_material' THEN
            v_item_id := v_item.raw_material_id;
            v_item_type_str := 'raw_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM raw_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للخامة #%', v_item_id; END IF;
            UPDATE raw_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'packaging_material' THEN
            v_item_id := v_item.packaging_material_id;
            v_item_type_str := 'packaging_materials';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM packaging_materials WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي لمادة التعبئة #%', v_item_id; END IF;
            UPDATE packaging_materials SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        ELSIF v_item.item_type = 'semi_finished' THEN
            v_item_id := v_item.semi_finished_product_id;
            v_item_type_str := 'semi_finished_products';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM semi_finished_products WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للمنتج نصف المصنع #%', v_item_id; END IF;
            UPDATE semi_finished_products SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;

        -- ===== NEW: Bundle Support =====
        ELSIF v_item.item_type = 'bundle' THEN
            v_item_id := v_item.bundle_id;
            v_item_type_str := 'product_bundles';
            SELECT quantity, COALESCE(unit_cost, 0) INTO v_current_qty, v_current_cost
            FROM product_bundles WHERE id = v_item_id;
            IF v_current_qty < v_item.quantity THEN RAISE EXCEPTION 'رصيد غير كافي للباندل #%', v_item_id; END IF;
            UPDATE product_bundles SET quantity = quantity - v_item.quantity, updated_at = NOW() WHERE id = v_item_id;
        -- ===============================
        END IF;

        UPDATE sales_invoice_items SET unit_cost_at_sale = v_current_cost WHERE id = v_item.id;

        IF v_item_id IS NOT NULL THEN
            PERFORM log_inventory_movement(
                v_item_id, v_item_type_str, 'out', v_item.quantity,
                'فاتورة بيع #' || v_invoice.invoice_number, 'SI-' || p_invoice_id::TEXT
            );
        END IF;
    END LOOP;

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
$function$;

ALTER FUNCTION public.process_sales_invoice(bigint) OWNER TO "postgres";
REVOKE ALL ON FUNCTION public.process_sales_invoice(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_sales_invoice(bigint) TO PUBLIC, anon, authenticated, service_role;

REVOKE UPDATE(full_name) ON public.profiles FROM PUBLIC,anon,authenticated;
REVOKE UPDATE ON public.profiles FROM PUBLIC,anon,authenticated;
GRANT UPDATE ON public.profiles TO anon,authenticated;
COMMIT;
-- Native security baseline restored, including its prior wider ACLs.
-- New private schemas/roles/receipts remain dormant for evidence and safe recovery.
-- No migration catalog exists on the observed live project; do not fabricate or
-- delete history. Use the reviewed hashes/deployment manifest for reconciliation.
