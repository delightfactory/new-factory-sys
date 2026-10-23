import {readCompleteRows} from '@/platform/data/read-complete-rows';
import { commercialCommand, factoryCommand } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";

export interface PurchaseInvoice {
    id: number;
    invoice_number: string;
    supplier_id: string;
    treasury_id?: number;
    transaction_date: string;
    total_amount: number;
    paid_amount: number;
    tax_amount: number;
    discount_amount: number;
    shipping_cost: number;
    status: 'draft' | 'posted' | 'void';
    notes?: string;
    supplier?: { name: string }; // joined
}

export interface PurchaseInvoiceItem {
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

export const PurchaseInvoicesService = {
    getInvoices: async () => readCompleteRows<PurchaseInvoice>(async (from, to) => {
        const {data, count, error} = await supabase.from('purchase_invoices')
            .select('*, supplier:parties!supplier_id(name)', {count: 'exact'})
            .order('created_at', {ascending: false}).order('id', {ascending: false}).range(from, to);
        return {rows: data as PurchaseInvoice[] | null, count, error};
    }),

    getUnpaidInvoices: async (supplierId: string) => {
        const invoices = await PurchaseInvoicesService.getPostedInvoices(supplierId);
        return invoices.filter(invoice => invoice.total_amount > invoice.paid_amount);
    },

    getPostedInvoices: async (supplierId: string) => readCompleteRows<PurchaseInvoice>(async (from, to) => {
        const {data, count, error} = await supabase.from('purchase_invoices').select('*', {count: 'exact'})
            .eq('supplier_id', supplierId).eq('status', 'posted')
            .order('created_at', {ascending: false}).order('id', {ascending: false}).range(from, to);
        return {rows: data as PurchaseInvoice[] | null, count, error};
    }),

    getInvoice: async (id: number) => {
        const { data, error } = await supabase
            .from('purchase_invoices')
            .select('*, items:purchase_invoice_items(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as (PurchaseInvoice & { items: PurchaseInvoiceItem[] });
    },

    createInvoice: async (invoice: Partial<PurchaseInvoice>, items: PurchaseInvoiceItem[]) => {
        return commercialCommand<PurchaseInvoice>("purchase", "invoice", invoice, items);
    },

    processInvoice: async (id: number) => {
        await factoryCommand("post_purchase_invoice", { id });
    },

    voidInvoice: async (id: number) => {
        await factoryCommand("void_purchase_invoice", { id });
    },

    deleteInvoice: async (id: number) => {
        // Only draft invoices can be deleted typically.
        const { data, error } = await supabase.from('purchase_invoices').delete().eq('id', id).eq('status', 'draft').select('id');
        if (error) throw error;
        if (data?.length !== 1 || data[0].id !== id) throw new Error('لم تُحذف المسودة. قد تكون حالتها تغيّرت؛ حدّث القائمة وراجع المستند.');
    }
};
