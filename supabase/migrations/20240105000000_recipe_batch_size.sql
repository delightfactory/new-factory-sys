-- Add recipe_batch_size to semi_finished_products
ALTER TABLE semi_finished_products 
ADD COLUMN IF NOT EXISTS recipe_batch_size NUMERIC NOT NULL DEFAULT 100;

-- Add quantity to semi_finished_ingredients to store the absolute amount in the recipe batch
ALTER TABLE semi_finished_ingredients
ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 0;

-- Update comments
COMMENT ON COLUMN semi_finished_products.recipe_batch_size IS 'The reference batch quantity for the defined recipe (e.g., 100 kg)';
COMMENT ON COLUMN semi_finished_ingredients.quantity IS 'The quantity of raw material used in the reference batch';
