-- ============================================================================
-- Migration: Disable Cost Propagation Triggers
-- Date: 2026-01-06
-- Purpose: Remove triggers that overwrite WACO-calculated costs
-- 
-- RISK LEVEL: 🟡 LOW - Only disables triggers, no data changes
-- 
-- Problem Solved:
--   Triggers were recalculating semi-finished and finished product costs
--   whenever raw material or packaging material prices changed.
--   This overwrote the actual WACO costs calculated during production.
--
-- What This Migration Does:
--   1. Disables trg_rm_cost_change - no longer updates semi-finished costs
--   2. Disables trg_sf_cost_change - no longer updates finished product costs  
--   3. Disables trg_pm_cost_change - no longer updates finished product costs
--
-- What Remains Active:
--   - trg_ingredient_change - still updates when recipe ingredients change
--   - trg_packaging_change - still updates when packaging definition changes
--   - trg_sf_batch_change - still updates when batch size changes
--   - trg_fp_def_change - still updates when finished product definition changes
--
-- After This Migration:
--   - Raw material price changes will NOT affect existing inventory costs
--   - Packaging material price changes will NOT affect existing inventory costs
--   - WACO from production/packaging orders will be the ONLY source of costs
--
-- Rollback:
--   Re-run 20240115000000_dynamic_cost_updates.sql to recreate triggers
-- ============================================================================

-- ============================================================================
-- 1. Disable Raw Material → Semi-Finished Cost Propagation
-- ============================================================================
-- This trigger was updating semi-finished product costs when raw material
-- prices changed. This is incorrect because:
-- - Existing inventory was produced at historical costs
-- - WACO should preserve the actual cost at time of production
-- ============================================================================
DROP TRIGGER IF EXISTS trg_rm_cost_change ON raw_materials;

-- Keep the function for potential future use, just remove the trigger
-- DROP FUNCTION IF EXISTS trigger_rm_cost_change(); -- Commented out to preserve

-- ============================================================================
-- 2. Disable Semi-Finished → Finished Product Cost Propagation
-- ============================================================================
-- This trigger was updating finished product costs when semi-finished
-- product costs changed. Same issue as above.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sf_cost_change ON semi_finished_products;

-- ============================================================================
-- 3. Disable Packaging Material → Finished Product Cost Propagation
-- ============================================================================
-- This trigger was updating finished product costs when packaging material
-- prices changed. Same issue as above.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_pm_cost_change ON packaging_materials;

-- ============================================================================
-- Add documentation comment
-- ============================================================================
COMMENT ON FUNCTION trigger_rm_cost_change() IS 
'[DISABLED] Was used to propagate raw material cost changes to semi-finished products. 
Disabled because it conflicted with WACO calculation from production orders.';

COMMENT ON FUNCTION trigger_sf_cost_change() IS 
'[DISABLED] Was used to propagate semi-finished cost changes to finished products.
Disabled because it conflicted with WACO calculation from packaging orders.';

COMMENT ON FUNCTION trigger_pm_cost_change() IS 
'[DISABLED] Was used to propagate packaging material cost changes to finished products.
Disabled because it conflicted with WACO calculation from packaging orders.';
