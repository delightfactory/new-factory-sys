import { supabase } from "@/integrations/supabase/client";

export interface SalesReturnItem {
    id?: number;
    return_id?: number;
    item_type: 'raw_material' | 'packaging_material' | 'semi_finished' | 'finished_product';
    raw_material_id?: number;
    packaging_material_id?: number;
    semi_finished_product_id?: number;
    finished_product_id?: number;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface SalesReturn {
    id: number;
    return_number: string;
    original_invoice_id?: number;
    customer_id: string;
    return_date: string;
    total_amount: number;
    status: 'draft' | 'posted' | 'void';
    notes?: string;
    items?: SalesReturnItem[];
    customer?: { name: string };
    created_at?: string;
}

export const SalesReturnsService = {
    getReturns: async () => {
        const { data, error } = await supabase
            .from('sales_returns')
            .select('*, customer:parties!customer_id(name)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as SalesReturn[];
    },

    getReturn: async (id: number) => {
        const { data, error } = await supabase
            .from('sales_returns')
            .select('*, customer:parties!customer_id(name), items:sales_return_items(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as SalesReturn;
    },

    createReturn: async (returnData: Partial<SalesReturn>, items: SalesReturnItem[]) => {
        // Generate Return Number
        const { data: code } = await supabase.rpc('get_next_code', {
            table_name: 'sales_returns',
            prefix: 'SR-'
        });

        const { data: ret, error: retError } = await supabase
            .from('sales_returns')
            .insert({
                ...returnData,
                return_number: code
            })
            .select()
            .single();

        if (retError) throw retError;

        const itemsWithId = items.map(item => ({
            ...item,
            return_id: ret.id
        }));

        const { error: itemsError } = await supabase
            .from('sales_return_items')
            .insert(itemsWithId);

        if (itemsError) throw itemsError;

        return ret;
    },

    processReturn: async (id: number) => {
        const { error } = await supabase.rpc('process_sales_return', { p_return_id: id });
        if (error) throw error;
    },

    deleteReturn: async (id: number) => {
        const { error } = await supabase.from('sales_returns').delete().eq('id', id);
        if (error) throw error;
    }
};
