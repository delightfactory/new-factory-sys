-- Exact function-only undo; owner and grants retained.
CREATE OR REPLACE FUNCTION public.analyze_packaging_requirements(p_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
    v_can_complete BOOLEAN := true;
    v_shortages JSONB := '[]'::JSONB;
    v_suggested_production JSONB := '[]'::JSONB;
    r_req RECORD;
    v_sf_shortage NUMERIC;
BEGIN
    -- Check if order exists and is pending
    IF NOT EXISTS (SELECT 1 FROM packaging_orders WHERE id = p_order_id AND status = 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'can_complete', false,
            'error', 'الأمر غير موجود أو ليس في حالة الانتظار'
        );
    END IF;

    -- Calculate requirements using a query (no temp table)
    FOR r_req IN 
        SELECT 
            sfp.id AS sf_id,
            sfp.name AS sf_name,
            sfp.unit AS sf_unit,
            sfp.quantity AS available_qty,
            COALESCE(sfp.recipe_batch_size, 100) AS recipe_batch_size,
            SUM(poi.quantity * COALESCE(fp.semi_finished_quantity, 0)) AS required_qty
        FROM packaging_order_items poi
        JOIN finished_products fp ON poi.finished_product_id = fp.id
        JOIN semi_finished_products sfp ON fp.semi_finished_id = sfp.id
        WHERE poi.packaging_order_id = p_order_id
          AND fp.semi_finished_id IS NOT NULL
        GROUP BY sfp.id, sfp.name, sfp.unit, sfp.quantity, sfp.recipe_batch_size
    LOOP
        v_sf_shortage := r_req.required_qty - COALESCE(r_req.available_qty, 0);
        
        IF v_sf_shortage > 0 THEN
            v_can_complete := false;
            
            -- Add to shortages list
            v_shortages := v_shortages || jsonb_build_object(
                'semi_finished_id', r_req.sf_id,
                'name', r_req.sf_name,
                'unit', r_req.sf_unit,
                'required_qty', r_req.required_qty,
                'available_qty', COALESCE(r_req.available_qty, 0),
                'shortage_qty', v_sf_shortage
            );
            
            -- Add to suggested production list
            v_suggested_production := v_suggested_production || jsonb_build_object(
                'semi_finished_id', r_req.sf_id,
                'name', r_req.sf_name,
                'unit', r_req.sf_unit,
                'suggested_qty', v_sf_shortage,
                'recipe_batch_size', r_req.recipe_batch_size
            );
        END IF;
    END LOOP;

    -- Build final result
    v_result := jsonb_build_object(
        'success', true,
        'can_complete', v_can_complete,
        'order_id', p_order_id,
        'shortages', v_shortages,
        'suggested_production', v_suggested_production,
        'shortage_count', jsonb_array_length(v_shortages)
    );

    RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    daily_sales NUMERIC;
    active_orders INT;
    low_stock_count INT;
    cash_balance NUMERIC;
    recent_activities JSONB;
BEGIN
    -- 1. Daily Sales (Sales Invoices created today)
    -- We use sales_invoices table directly
    SELECT COALESCE(SUM(total_amount), 0) INTO daily_sales
    FROM public.sales_invoices
    WHERE created_at >= CURRENT_DATE;

    -- 2. Active Orders (Production + Packaging)
    SELECT 
        (SELECT COUNT(*) FROM public.production_orders WHERE status IN ('pending', 'inProgress')) +
        (SELECT COUNT(*) FROM public.packaging_orders WHERE status IN ('pending', 'inProgress'))
    INTO active_orders;

    -- 3. Low Stock Items (Raw Materials)
    SELECT COUNT(*) INTO low_stock_count
    FROM public.raw_materials
    WHERE quantity <= min_stock;

    -- 4. Cash Balance (Sum of all Treasuries)
    SELECT COALESCE(SUM(balance), 0) INTO cash_balance
    FROM public.treasuries;

    -- 5. Recent Activities (Last 10 Audit Logs with User Names)
    SELECT jsonb_agg(t) INTO recent_activities
    FROM (
        SELECT 
            al.id,
            al.action,
            al.table_name,
            al.created_at,
            p.full_name as user_name
        FROM public.audit_logs al
        LEFT JOIN public.profiles p ON al.user_id = p.id
        ORDER BY al.created_at DESC
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'daily_sales', daily_sales,
        'active_orders', active_orders,
        'low_stock_count', low_stock_count,
        'cash_balance', cash_balance,
        'recent_activities', COALESCE(recent_activities, '[]'::jsonb)
    );
END;
$function$
;