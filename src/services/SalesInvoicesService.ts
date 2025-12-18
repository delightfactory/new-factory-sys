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
    item_type: 'raw_material' | 'packaging_material' | 'finished_product' | 'semi_finished';
    raw_material_id?: number;
    packaging_material_id?: number;
    finished_product_id?: number;
    semi_finished_product_id?: number;
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
        // 0. Auto-generate invoice_number if not provided
        if (!invoice.invoice_number) {
            const { data: code } = await supabase.rpc('get_next_code', {
                table_name: 'sales_invoices',
                prefix: 'SI'
            });
            invoice.invoice_number = code;
        }

        // 1. Create Header
        const { data: header, error: headerError } = await supabase
            .from('sales_invoices')
            .insert(invoice)
            .select()
            .single();

        if (headerError) throw headerError;
        if (!header) throw new Error("Failed to create invoice header");

        // 2. Prepare Items
        const itemsToInsert = items.map(item => ({
            ...item,
            invoice_id: header.id,
            // Calculate total if missing
            total_price: item.quantity * item.unit_price
        }));

        const { error: itemsError } = await supabase
            .from('sales_invoice_items')
            .insert(itemsToInsert);

        if (itemsError) {
            // Rollback header? (Manually delete)
            await supabase.from('sales_invoices').delete().eq('id', header.id);
            throw itemsError;
        }

        return header;
    },

    processInvoice: async (id: number) => {
        const { error } = await supabase.rpc('process_sales_invoice', { p_invoice_id: id });
        if (error) throw error;
    },

    voidInvoice: async (id: number) => {
        const { error } = await supabase.rpc('void_sales_invoice', { p_invoice_id: id });
        if (error) throw error;
    },

    deleteInvoice: async (id: number) => {
        const { error } = await supabase.from('sales_invoices').delete().eq('id', id).eq('status', 'draft');
        if (error) throw error;
    }
};
