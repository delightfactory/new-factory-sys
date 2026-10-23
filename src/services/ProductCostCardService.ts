import { supabase } from '@/integrations/supabase/client';
import { loadCostSources, buildCostCards, type CostFetchers } from '@/features/reports/cost-card';
const fetchers: CostFetchers = {
    finished: async (from, to) => { const { data, count, error } = await supabase.from('finished_products').select('id,code,name,unit,quantity,unit_cost,sales_price,semi_finished_id,semi_finished_quantity', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
    semi: async (from, to) => { const { data, count, error } = await supabase.from('semi_finished_products').select('id,name,unit,unit_cost,recipe_batch_size', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
    ingredients: async (from, to) => { const { data, count, error } = await supabase.from('semi_finished_ingredients').select('id,semi_finished_id,raw_material_id,quantity,percentage', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
    packaging: async (from, to) => { const { data, count, error } = await supabase.from('finished_product_packaging').select('id,finished_product_id,packaging_material_id,quantity', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
    raw: async (from, to) => { const { data, count, error } = await supabase.from('raw_materials').select('id,name,unit,unit_cost', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
    materials: async (from, to) => { const { data, count, error } = await supabase.from('packaging_materials').select('id,name,unit,unit_cost', { count: 'exact' }).order('id').range(from, to); return { rows: data, count, error }; },
};
export async function loadProductCostCards() { return buildCostCards(await loadCostSources(fetchers)); }
