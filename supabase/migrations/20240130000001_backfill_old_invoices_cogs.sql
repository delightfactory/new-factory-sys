-- ============================================================================
-- Script: Backfill COGS for Previously Posted Sales Invoices
-- Date: 2026-01-04
-- Purpose: Update unit_cost_at_sale for old invoices that were posted before
--          the COGS tracking fix was applied.
-- 
-- IMPORTANT NOTES:
-- 1. This uses the CURRENT unit_cost of products, which may differ from 
--    what it was at the time of sale (WACO changes over time).
-- 2. This is an approximation, not 100% accurate historical cost.
-- 3. This script is SAFE to run multiple times (idempotent).
-- 4. Run this AFTER applying the 20240130000000_fix_cogs_tracking.sql migration.
-- ============================================================================

-- Transaction block for safety
BEGIN;

-- Update finished products COGS
UPDATE sales_invoice_items sii
SET unit_cost_at_sale = fp.unit_cost
FROM finished_products fp
WHERE sii.finished_product_id = fp.id
  AND sii.item_type = 'finished_product'
  AND (sii.unit_cost_at_sale IS NULL OR sii.unit_cost_at_sale = 0);

-- Update raw materials COGS
UPDATE sales_invoice_items sii
SET unit_cost_at_sale = rm.unit_cost
FROM raw_materials rm
WHERE sii.raw_material_id = rm.id
  AND sii.item_type = 'raw_material'
  AND (sii.unit_cost_at_sale IS NULL OR sii.unit_cost_at_sale = 0);

-- Update packaging materials COGS
UPDATE sales_invoice_items sii
SET unit_cost_at_sale = pm.unit_cost
FROM packaging_materials pm
WHERE sii.packaging_material_id = pm.id
  AND sii.item_type = 'packaging_material'
  AND (sii.unit_cost_at_sale IS NULL OR sii.unit_cost_at_sale = 0);

-- Update semi-finished products COGS
UPDATE sales_invoice_items sii
SET unit_cost_at_sale = sfp.unit_cost
FROM semi_finished_products sfp
WHERE sii.semi_finished_product_id = sfp.id
  AND sii.item_type = 'semi_finished'
  AND (sii.unit_cost_at_sale IS NULL OR sii.unit_cost_at_sale = 0);

-- Verification query (run this to check results)
-- SELECT 
--     si.invoice_number,
--     si.transaction_date,
--     sii.item_type,
--     sii.quantity,
--     sii.unit_price as selling_price,
--     sii.unit_cost_at_sale as cost,
--     (sii.quantity * sii.unit_cost_at_sale) as total_cogs
-- FROM sales_invoice_items sii
-- JOIN sales_invoices si ON sii.invoice_id = si.id
-- WHERE si.status = 'posted'
-- ORDER BY si.transaction_date DESC
-- LIMIT 20;

COMMIT;

-- ============================================================================
-- Summary message (will show in query results)
-- ============================================================================
SELECT 'تم تحديث تكلفة البضاعة المباعة للفواتير القديمة بنجاح' as message;
