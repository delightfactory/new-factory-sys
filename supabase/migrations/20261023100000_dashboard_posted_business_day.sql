-- Release candidate only: production application requires separate owner approval.
BEGIN;
-- LOCAL candidate; Egyptian factory business day inferred from owner timezone and EGP UI.
-- Gross posted sales invoices only; returns/net income remain separate measures.
DO $daily_guard$ BEGIN
 IF md5(pg_get_functiondef('public.get_dashboard_stats()'::regprocedure)) <> '3b4068fa7d1b8e9b079ac3b0ee76db07' THEN RAISE EXCEPTION 'DAILY_SALES_BASELINE_CHANGED'; END IF;
 IF (SELECT pg_get_expr(adbin,adrelid) FROM pg_attrdef WHERE adrelid='public.sales_invoices'::regclass AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid='public.sales_invoices'::regclass AND attname='transaction_date')) IS DISTINCT FROM 'CURRENT_DATE' THEN RAISE EXCEPTION 'SALES_DATE_DEFAULT_BASELINE_CHANGED'; END IF;
END; $daily_guard$;
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
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
        RAISE EXCEPTION 'Access Denied: An active user profile is required.';
    END IF;
    -- 1. Daily Sales (posted invoices by transaction date in the factory business day)
    -- We use sales_invoices table directly
    SELECT COALESCE(SUM(total_amount), 0) INTO daily_sales
    FROM public.sales_invoices
    WHERE status = 'posted' AND transaction_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::date;

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
$function$;

ALTER TABLE public.sales_invoices ALTER COLUMN transaction_date SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')::date;

NOTIFY pgrst, 'reload schema';
COMMIT;
