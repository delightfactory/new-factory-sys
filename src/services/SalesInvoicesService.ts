import { commercialCommand, factoryCommand } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";

export interface SalesInvoice {
    id: number;
    invoice_number: string;
    customer_id: string; // Changed from supplier_id
    treasury_id?: number;
    transaction_date: string;
    total_amount: number;
    paid_amount: number;
    tax_amount: number;
    discount_amount: number;
    shipping_cost: number;
    status: 'draft' | 'posted' | 'void';
    notes?: string;
    customer?: { name: string }; // joined
}

export interface SalesInvoiceItem {
    id?: number;
    invoice_id?: number;
    item_type: 'raw_material' | 'packaging_material' | 'finished_product' | 'semi_finished' | 'bundle';
    raw_material_id?: number;
    packaging_material_id?: number;
    finished_product_id?: number;
    semi_finished_product_id?: number;
    bundle_id?: number;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_name?: string; // helper for UI
}

export const SalesInvoicesService = {
    getInvoices: async () => {
        const { data, error } = await supabase
            .from('sales_invoices')
            .select('*, customer:parties!customer_id(name)') // Join customer
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as SalesInvoice[];
    },

    getUnpaidInvoices: async (customerId: string) => {
        const { data, error } = await supabase
            .from('sales_invoices')
            .select('*')
            .eq('customer_id', customerId)
            .eq('status', 'posted');
        if (error) throw error;
        return (data as SalesInvoice[]).filter(inv => inv.total_amount > inv.paid_amount);
    },

    getPostedInvoices: async (customerId: string) => {
        const { data, error } = await supabase
            .from('sales_invoices')
            .select('*')
            .eq('customer_id', customerId)
            .eq('status', 'posted')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as SalesInvoice[];
    },

    getInvoice: async (id: number) => {
        const { data, error } = await supabase
            .from('sales_invoices')
            .select('*, items:sales_invoice_items(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as (SalesInvoice & { items: SalesInvoiceItem[] });
    },

    createInvoice: async (invoice: Partial<SalesInvoice>, items: SalesInvoiceItem[]) => {
        return commercialCommand<SalesInvoice>("sales", "invoice", invoice, items);
    },

    processInvoice: async (id: number) => {
        await factoryCommand("post_sales_invoice", { id });
    },

    voidInvoice: async (id: number) => {
        await factoryCommand("void_sales_invoice", { id });
    },

    deleteInvoice: async (id: number) => {
        const { error } = await supabase.from('sales_invoices').delete().eq('id', id).eq('status', 'draft');
        if (error) throw error;
    }
};
