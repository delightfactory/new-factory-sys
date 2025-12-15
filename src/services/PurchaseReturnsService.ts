import { supabase } from "@/integrations/supabase/client";

export interface ReturnItem {
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

export interface PurchaseReturn {
    id: number;
    return_number: string;
    original_invoice_id?: number;
    supplier_id: string;
    return_date: string;
    total_amount: number;
    status: 'draft' | 'posted' | 'void';
    notes?: string;
    items?: ReturnItem[];
    supplier?: { name: string };
    created_at?: string;
}

export const PurchaseReturnsService = {
    getReturns: async () => {
        const { data, error } = await supabase
            .from('purchase_returns')
            .select('*, supplier:parties!supplier_id(name)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as PurchaseReturn[];
    },

    getReturn: async (id: number) => {
        const { data, error } = await supabase
            .from('purchase_returns')
            .select('*, supplier:parties!supplier_id(name), items:purchase_return_items(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as PurchaseReturn;
    },

    createReturn: async (returnData: Partial<PurchaseReturn>, items: ReturnItem[]) => {
        // 1. Generate Return Number
        const { data: code } = await supabase.rpc('get_next_code', {
            table_name: 'purchase_returns',
            prefix: 'PR-'
        });

        // 2. Create Return Header
        const { data: ret, error: retError } = await supabase
            .from('purchase_returns')
            .insert({
                ...returnData,
                return_number: code
            })
            .select()
            .single();

        if (retError) throw retError;

        // 2. Create Items
        const itemsWithId = items.map(item => ({
            ...item,
            return_id: ret.id
        }));

        const { error: itemsError } = await supabase
            .from('purchase_return_items')
            .insert(itemsWithId);

        if (itemsError) throw itemsError;

        return ret;
    },

    processReturn: async (id: number) => {
        const { error } = await supabase.rpc('process_purchase_return', { p_return_id: id });
        if (error) throw error;
    },

    deleteReturn: async (id: number) => {
        const { error } = await supabase.from('purchase_returns').delete().eq('id', id);
        if (error) throw error;
    }
};
