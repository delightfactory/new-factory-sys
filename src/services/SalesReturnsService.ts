import { commercialCommand, factoryCommand } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";

export interface SalesReturnItem {
    id?: number;
    return_id?: number;
    item_type: 'raw_material' | 'packaging_material' | 'semi_finished' | 'finished_product' | 'bundle';
    raw_material_id?: number;
    packaging_material_id?: number;
    semi_finished_product_id?: number;
    finished_product_id?: number;
    bundle_id?: number;
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
        return commercialCommand<SalesReturn>("sales", "return", returnData, items);
    },

    processReturn: async (id: number) => {
        await factoryCommand("post_sales_return", { id });
    },

    deleteReturn: async (id: number) => {
        const { error } = await supabase.from('sales_returns').delete().eq('id', id);
        if (error) throw error;
    },

    // Void a posted sales return (reverses inventory and balance)
    voidReturn: async (id: number) => {
        await factoryCommand("void_sales_return", { id });
    }
};
