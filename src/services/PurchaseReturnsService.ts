import { commercialCommand, factoryCommand } from "./FactoryCommandsService";
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
        return commercialCommand<PurchaseReturn>("purchase", "return", returnData, items);
    },

    processReturn: async (id: number) => {
        await factoryCommand("post_purchase_return", { id });
    },

    deleteReturn: async (id: number) => {
        const { error } = await supabase.from('purchase_returns').delete().eq('id', id);
        if (error) throw error;
    },

    // Void a posted purchase return (reverses inventory and balance)
    voidReturn: async (id: number) => {
        await factoryCommand("void_purchase_return", { id });
    }
};
