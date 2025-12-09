-- 1. Helper Function: Recalculate Semi-Finished Cost
CREATE OR REPLACE FUNCTION recalculate_semi_finished_cost(semi_id BIGINT)
RETURNS VOID AS $$
DECLARE
    total_batch_cost NUMERIC := 0;
    batch_size NUMERIC := 1;
    new_unit_cost NUMERIC := 0;
BEGIN
    -- Get Batch Size
    SELECT recipe_batch_size INTO batch_size
    FROM semi_finished_products
    WHERE id = semi_id;

    -- Prevent divide by zero
    IF batch_size IS NULL OR batch_size = 0 THEN
        batch_size := 1;
    END IF;

    -- Calculate Total Cost of Ingredients
    SELECT COALESCE(SUM(sfi.quantity * rm.unit_cost), 0)
    INTO total_batch_cost
    FROM semi_finished_ingredients sfi
    JOIN raw_materials rm ON sfi.raw_material_id = rm.id
    WHERE sfi.semi_finished_id = semi_id;

    -- Calculate New Unit Cost
    new_unit_cost := total_batch_cost / batch_size;

    -- Update the product (Will trigger finished product update if value changes)
    UPDATE semi_finished_products
    SET unit_cost = new_unit_cost
    WHERE id = semi_id
    AND unit_cost IS DISTINCT FROM new_unit_cost; -- Only update if changed to avoid unnecessary churn
END;
$$ LANGUAGE plpgsql;


-- 2. Helper Function: Recalculate Finished Product Cost
CREATE OR REPLACE FUNCTION recalculate_finished_product_cost(prod_id BIGINT)
RETURNS VOID AS $$
DECLARE
    semi_id BIGINT;
    semi_qty NUMERIC;
    semi_cost NUMERIC := 0;
    pkg_cost NUMERIC := 0;
    new_total_cost NUMERIC := 0;
BEGIN
    -- Get Base Semi-Finished Details
    SELECT semi_finished_id, semi_finished_quantity
    INTO semi_id, semi_qty
    FROM finished_products
    WHERE id = prod_id;

    -- Calculate Base Cost (Semi-Finished)
    IF semi_id IS NOT NULL THEN
        SELECT unit_cost INTO semi_cost
        FROM semi_finished_products
        WHERE id = semi_id;
    END IF;

    -- Calculate Packaging Cost
    SELECT COALESCE(SUM(fpp.quantity * pm.unit_cost), 0)
    INTO pkg_cost
    FROM finished_product_packaging fpp
    JOIN packaging_materials pm ON fpp.packaging_material_id = pm.id
    WHERE fpp.finished_product_id = prod_id;

    -- Total
    new_total_cost := (COALESCE(semi_cost, 0) * COALESCE(semi_qty, 0)) + pkg_cost;

    -- Update Finished Product
    UPDATE finished_products
    SET unit_cost = new_total_cost
    WHERE id = prod_id
    AND unit_cost IS DISTINCT FROM new_total_cost;
END;
$$ LANGUAGE plpgsql;


-- 3. Trigger: Raw Material Cost Change -> Update Semi-Finished
CREATE OR REPLACE FUNCTION trigger_rm_cost_change()
RETURNS TRIGGER AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Only run if unit_cost changed
    IF OLD.unit_cost IS DISTINCT FROM NEW.unit_cost THEN
        -- Find all semi-finished products using this raw material
        FOR rec IN 
            SELECT DISTINCT semi_finished_id 
            FROM semi_finished_ingredients 
            WHERE raw_material_id = NEW.id
        LOOP
            PERFORM recalculate_semi_finished_cost(rec.semi_finished_id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rm_cost_change ON raw_materials;
CREATE TRIGGER trg_rm_cost_change
AFTER UPDATE OF unit_cost ON raw_materials
FOR EACH ROW
EXECUTE FUNCTION trigger_rm_cost_change();


-- 4. Trigger: Ingredient Change (Qty/Add/Remove) -> Update Semi-Finished
CREATE OR REPLACE FUNCTION trigger_ingredient_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM recalculate_semi_finished_cost(OLD.semi_finished_id);
        RETURN OLD;
    ELSE
        PERFORM recalculate_semi_finished_cost(NEW.semi_finished_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingredient_change ON semi_finished_ingredients;
CREATE TRIGGER trg_ingredient_change
AFTER INSERT OR UPDATE OR DELETE ON semi_finished_ingredients
FOR EACH ROW
EXECUTE FUNCTION trigger_ingredient_change();


-- 5. Trigger: Semi-Finished Recipe Batch Size Change -> Update Itself
CREATE OR REPLACE FUNCTION trigger_sf_batch_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.recipe_batch_size IS DISTINCT FROM NEW.recipe_batch_size THEN
        PERFORM recalculate_semi_finished_cost(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sf_batch_change ON semi_finished_products;
CREATE TRIGGER trg_sf_batch_change
AFTER UPDATE OF recipe_batch_size ON semi_finished_products
FOR EACH ROW
EXECUTE FUNCTION trigger_sf_batch_change();


-- 6. Trigger: Semi-Finished Cost Change -> Update Finished Products
CREATE OR REPLACE FUNCTION trigger_sf_cost_change()
RETURNS TRIGGER AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Only if cost changed
    IF OLD.unit_cost IS DISTINCT FROM NEW.unit_cost THEN
        -- Find all finished products using this semi-finished
        FOR rec IN
            SELECT id
            FROM finished_products
            WHERE semi_finished_id = NEW.id
        LOOP
            PERFORM recalculate_finished_product_cost(rec.id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sf_cost_change ON semi_finished_products;
CREATE TRIGGER trg_sf_cost_change
AFTER UPDATE OF unit_cost ON semi_finished_products
FOR EACH ROW
EXECUTE FUNCTION trigger_sf_cost_change();


-- 7. Trigger: Packaging Material Cost Change -> Update Finished Products
CREATE OR REPLACE FUNCTION trigger_pm_cost_change()
RETURNS TRIGGER AS $$
DECLARE
    rec RECORD;
BEGIN
    IF OLD.unit_cost IS DISTINCT FROM NEW.unit_cost THEN
        FOR rec IN
            SELECT DISTINCT finished_product_id
            FROM finished_product_packaging
            WHERE packaging_material_id = NEW.id
        LOOP
            PERFORM recalculate_finished_product_cost(rec.finished_product_id);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pm_cost_change ON packaging_materials;
CREATE TRIGGER trg_pm_cost_change
AFTER UPDATE OF unit_cost ON packaging_materials
FOR EACH ROW
EXECUTE FUNCTION trigger_pm_cost_change();


-- 8. Trigger: Packaging Item Change -> Update Finished Product
CREATE OR REPLACE FUNCTION trigger_packaging_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM recalculate_finished_product_cost(OLD.finished_product_id);
        RETURN OLD;
    ELSE
        PERFORM recalculate_finished_product_cost(NEW.finished_product_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_packaging_change ON finished_product_packaging;
CREATE TRIGGER trg_packaging_change
AFTER INSERT OR UPDATE OR DELETE ON finished_product_packaging
FOR EACH ROW
EXECUTE FUNCTION trigger_packaging_change();


-- 9. Trigger: Finished Product Definition Change -> Update Itself
CREATE OR REPLACE FUNCTION trigger_fp_def_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.semi_finished_id IS DISTINCT FROM NEW.semi_finished_id 
    OR OLD.semi_finished_quantity IS DISTINCT FROM NEW.semi_finished_quantity THEN
        PERFORM recalculate_finished_product_cost(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fp_def_change ON finished_products;
CREATE TRIGGER trg_fp_def_change
AFTER UPDATE OF semi_finished_id, semi_finished_quantity ON finished_products
FOR EACH ROW
EXECUTE FUNCTION trigger_fp_def_change();
