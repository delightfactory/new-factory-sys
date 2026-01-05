-- ============================================================================
-- سكريبت توثيق الحالة الحالية قبل التحسينات
-- Document Current State Before Improvements
-- التاريخ: 2026-01-05
-- ============================================================================

-- تشغيل هذا السكريبت في Supabase SQL Editor لتوثيق الحالة الحالية
-- الإخراج سيكون بيانات JSON يمكن حفظها للمقارنة لاحقاً

-- 1. أرصدة الخزائن
SELECT 'TREASURIES' as section, jsonb_agg(
    jsonb_build_object(
        'id', id,
        'name', name,
        'balance', balance,
        'type', type
    )
) as data
FROM treasuries;

-- 2. أرصدة الأطراف (العملاء والموردين)
SELECT 'PARTIES' as section, jsonb_agg(
    jsonb_build_object(
        'id', id,
        'name', name,
        'type', type,
        'balance', balance
    )
) as data
FROM parties
WHERE balance != 0;

-- 3. ملخص المخزون
SELECT 'INVENTORY_SUMMARY' as section, jsonb_build_object(
    'raw_materials', (SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_qty', SUM(quantity),
        'total_value', SUM(quantity * COALESCE(unit_cost, 0))
    ) FROM raw_materials),
    'packaging_materials', (SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_qty', SUM(quantity),
        'total_value', SUM(quantity * COALESCE(unit_cost, 0))
    ) FROM packaging_materials),
    'semi_finished', (SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_qty', SUM(quantity),
        'total_value', SUM(quantity * COALESCE(unit_cost, 0))
    ) FROM semi_finished_products),
    'finished_products', (SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_qty', SUM(quantity),
        'total_value', SUM(quantity * COALESCE(unit_cost, 0))
    ) FROM finished_products)
) as data;

-- 5. إحصائيات المرتجعات
SELECT 'RETURNS_STATS' as section, jsonb_build_object(
    'purchase_returns', (SELECT jsonb_build_object(
        'draft_count', COUNT(*) FILTER (WHERE status = 'draft'),
        'posted_count', COUNT(*) FILTER (WHERE status = 'posted'),
        'total_amount', SUM(total_amount) FILTER (WHERE status = 'posted')
    ) FROM purchase_returns),
    'sales_returns', (SELECT jsonb_build_object(
        'draft_count', COUNT(*) FILTER (WHERE status = 'draft'),
        'posted_count', COUNT(*) FILTER (WHERE status = 'posted'),
        'total_amount', SUM(total_amount) FILTER (WHERE status = 'posted')
    ) FROM sales_returns)
) as data;

-- 6. الدوال الموجودة حالياً
SELECT 'EXISTING_FUNCTIONS' as section, jsonb_agg(
    jsonb_build_object(
        'name', p.proname,
        'args', pg_get_function_arguments(p.oid)
    )
) as data
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'process_purchase_invoice',
    'process_sales_invoice',
    'process_purchase_return',
    'process_sales_return',
    'void_purchase_invoice',
    'void_sales_invoice',
    'complete_production_order',
    'complete_production_order_atomic',
    'complete_packaging_order',
    'complete_packaging_order_atomic',
    'handle_treasury_transaction',
    'transfer_between_treasuries'
);

-- 7. حركات المخزون الأخيرة (للتحقق من صحة التسجيل)
SELECT 'LAST_MOVEMENTS' as section, jsonb_agg(t) as data
FROM (
    SELECT id, item_type, movement_type, quantity, reason, reference_id, created_at
    FROM inventory_movements
    ORDER BY created_at DESC
    LIMIT 10
) t;
