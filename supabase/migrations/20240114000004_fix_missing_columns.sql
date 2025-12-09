-- Fix missing columns for Invoice RPCs safety
-- Ensure 'price_per_unit' exists on all inventory tables (Used for Weighted Average Cost)

DO $$
BEGIN
    -- Raw Materials
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_materials' AND column_name = 'price_per_unit') THEN
        ALTER TABLE raw_materials ADD COLUMN price_per_unit NUMERIC DEFAULT 0;
    END IF;

    -- Packaging Materials
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packaging_materials' AND column_name = 'price_per_unit') THEN
        ALTER TABLE packaging_materials ADD COLUMN price_per_unit NUMERIC DEFAULT 0;
    END IF;

    -- Finished Products (This will be used as 'Cost', separate from selling price)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'finished_products' AND column_name = 'price_per_unit') THEN
        ALTER TABLE finished_products ADD COLUMN price_per_unit NUMERIC DEFAULT 0;
    END IF;

    -- Semi-Finished Products
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'semi_finished_products' AND column_name = 'price_per_unit') THEN
        ALTER TABLE semi_finished_products ADD COLUMN price_per_unit NUMERIC DEFAULT 0;
    END IF;

    -- Double check financial_transactions reference columns (Safety)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_transactions' AND column_name = 'reference_type') THEN
        ALTER TABLE financial_transactions ADD COLUMN reference_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_transactions' AND column_name = 'reference_id') THEN
        ALTER TABLE financial_transactions ADD COLUMN reference_id TEXT;
    END IF;

END $$;
