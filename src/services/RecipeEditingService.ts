import { supabase } from '@/integrations/supabase/client';
import { readCompleteRows } from '@/platform/data/read-complete-rows';

export const RecipeEditingService = {
    async semi(id: number) {
        const { data: product, error } = await supabase.from('semi_finished_products').select('*').eq('id', id).single();
        if (error || !product) throw error ?? new Error('المنتج غير موجود');
        const ingredients = await readCompleteRows(async (from, to) => {
            const { data, count, error } = await supabase.from('semi_finished_ingredients')
                .select('*', { count: 'exact' }).eq('semi_finished_id', id).order('id').range(from, to);
            return { rows: data, count, error };
        }, 'RECIPE');
        return { product, ingredients };
    },
    async finished(id: number) {
        const { data: product, error } = await supabase.from('finished_products').select('*').eq('id', id).single();
        if (error || !product) throw error ?? new Error('المنتج غير موجود');
        const packaging = await readCompleteRows(async (from, to) => {
            const { data, count, error } = await supabase.from('finished_product_packaging')
                .select('*', { count: 'exact' }).eq('finished_product_id', id).order('id').range(from, to);
            return { rows: data, count, error };
        }, 'PACKAGING_RECIPE');
        return { product, packaging };
    },
};
