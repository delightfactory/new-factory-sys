import { supabase } from '@/integrations/supabase/client';
import { loadPerformanceSources, type PerformanceSources } from '@/features/reports/product-performance';

export async function readProductPerformance() {
    const sources = await loadPerformanceSources({
        products: async (from, to) => {
            const { data, count, error } = await supabase.from('finished_products').select('id,code,name,sales_price::text,unit_cost::text,quantity::text', { count: 'exact' }).order('id').range(from, to);
            return { rows: data as PerformanceSources['products'], count, error };
        },
        bundles: async (from, to) => {
            const { data, count, error } = await supabase.from('product_bundles').select('id,code,name,bundle_price::text,quantity::text', { count: 'exact' }).eq('is_active', true).order('id').range(from, to);
            return { rows: data as PerformanceSources['bundles'], count, error };
        },
        components: async (from, to) => {
            const { data, count, error } = await supabase.from('bundle_items').select(`id,bundle_id,item_type,quantity::text,
                finished_product:finished_products(name,unit_cost::text),semi_finished:semi_finished_products(name,unit_cost::text),
                raw_material:raw_materials(name,unit_cost::text),packaging_material:packaging_materials(name,unit_cost::text)`, { count: 'exact' }).order('id').range(from, to);
            return { rows: data as unknown as PerformanceSources['components'], count, error };
        },
        sales: async (from, to) => {
            const { data, count, error } = await supabase.from('sales_invoice_items').select('id,invoice_id,item_type,finished_product_id,bundle_id,quantity::text,unit_price::text,sales_invoices!inner(invoice_number,transaction_date,status)', { count: 'exact' })
                .eq('sales_invoices.status', 'posted').order('id').range(from, to);
            return { rows: data as unknown as PerformanceSources['sales'], count, error };
        },
    });
    return { ...sources, capturedAt: new Date().toISOString() };
}

