-- ===========================================
-- إعادة ضبط عدادات الجداول (Sequence Reset)
-- يُستخدم بعد استيراد نسخة احتياطية تحتوي على IDs محددة
-- ===========================================

-- الجداول الرئيسية (المنتجات والخامات)
SELECT setval(pg_get_serial_sequence('raw_materials', 'id'), COALESCE((SELECT MAX(id) FROM raw_materials), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('packaging_materials', 'id'), COALESCE((SELECT MAX(id) FROM packaging_materials), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('semi_finished_products', 'id'), COALESCE((SELECT MAX(id) FROM semi_finished_products), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('finished_products', 'id'), COALESCE((SELECT MAX(id) FROM finished_products), 0) + 1, false);

-- الجداول الفرعية (المكونات والتغليف)
SELECT setval(pg_get_serial_sequence('semi_finished_ingredients', 'id'), COALESCE((SELECT MAX(id) FROM semi_finished_ingredients), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('finished_product_packaging', 'id'), COALESCE((SELECT MAX(id) FROM finished_product_packaging), 0) + 1, false);

-- الأوامر
SELECT setval(pg_get_serial_sequence('production_orders', 'id'), COALESCE((SELECT MAX(id) FROM production_orders), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('packaging_orders', 'id'), COALESCE((SELECT MAX(id) FROM packaging_orders), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('production_order_items', 'id'), COALESCE((SELECT MAX(id) FROM production_order_items), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('packaging_order_items', 'id'), COALESCE((SELECT MAX(id) FROM packaging_order_items), 0) + 1, false);

-- الفواتير
SELECT setval(pg_get_serial_sequence('purchase_invoices', 'id'), COALESCE((SELECT MAX(id) FROM purchase_invoices), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('sales_invoices', 'id'), COALESCE((SELECT MAX(id) FROM sales_invoices), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('purchase_invoice_items', 'id'), COALESCE((SELECT MAX(id) FROM purchase_invoice_items), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('sales_invoice_items', 'id'), COALESCE((SELECT MAX(id) FROM sales_invoice_items), 0) + 1, false);

-- المرتجعات
SELECT setval(pg_get_serial_sequence('purchase_returns', 'id'), COALESCE((SELECT MAX(id) FROM purchase_returns), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('sales_returns', 'id'), COALESCE((SELECT MAX(id) FROM sales_returns), 0) + 1, false);

-- المالية
SELECT setval(pg_get_serial_sequence('financial_transactions', 'id'), COALESCE((SELECT MAX(id) FROM financial_transactions), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('treasuries', 'id'), COALESCE((SELECT MAX(id) FROM treasuries), 0) + 1, false);

-- الجرد
SELECT setval(pg_get_serial_sequence('inventory_count_sessions', 'id'), COALESCE((SELECT MAX(id) FROM inventory_count_sessions), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('inventory_count_items', 'id'), COALESCE((SELECT MAX(id) FROM inventory_count_items), 0) + 1, false);

-- ===========================================
-- ملاحظة: يجب تنفيذ هذا الاستعلام في Supabase SQL Editor
-- بعد كل عملية استعادة (Restore) للنسخة الاحتياطية
-- ===========================================
