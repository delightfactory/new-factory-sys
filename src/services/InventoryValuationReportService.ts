import {supabase} from '@/integrations/supabase/client';
import {loadValuationSources, type ValuationItem} from '@/features/reports/inventory-valuation';
import type {DataPage} from '@/platform/data/read-complete-rows';
const TABLES = {raw: 'raw_materials', packaging: 'packaging_materials', semi: 'semi_finished_products', finished: 'finished_products', bundle: 'product_bundles'} as const;
export async function readInventoryValuation() {
    const page = async (type: keyof typeof TABLES, from: number, to: number): Promise<DataPage<ValuationItem>> => {
        const columns = 'id,code,name,quantity::text,unit_cost::text'+(type === 'bundle' ? '' : ',unit');
        let query = supabase.from(TABLES[type]).select(columns, {count: 'exact'});
        if (type === 'bundle') query = query.eq('is_active', true);
        const {data, count, error} = await query.order('id').range(from, to).returns<ValuationItem[]>();
        return {rows: data, count, error};
    };
    const sources = await loadValuationSources({raw: (from, to) => page('raw', from, to), packaging: (from, to) => page('packaging', from, to), semi: (from, to) => page('semi', from, to), finished: (from, to) => page('finished', from, to), bundle: (from, to) => page('bundle', from, to)});
    return {sources, capturedAt: new Date().toISOString()};
}
