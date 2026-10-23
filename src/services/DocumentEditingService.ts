import { supabase } from '@/integrations/supabase/client';
import { factoryCommand } from './FactoryCommandsService';

export type DocumentKind = 'production_order' | 'packaging_order' | 'sales_invoice' | 'purchase_invoice';
export interface EditableDocument {
    revision: string;
    header: {
        id: number; status: string; code?: string; invoice_number?: string;
        date?: string; transaction_date?: string; notes?: string | null;
        customer_id?: string; supplier_id?: string; treasury_id?: number | null;
        paid_amount?: number; tax_amount?: number; discount_amount?: number; shipping_cost?: number;
        created_at: string; updated_at: string;
    };
    items: Array<Record<string, string | number | null>>;
}

export const DocumentEditingService = {
    async get(kind: DocumentKind, id: number): Promise<EditableDocument> {
        const { data, error } = await supabase.rpc('factory_native_document', { p_kind: kind, p_id: id });
        if (error) throw new Error(error.message.includes('MCP_ACCESS_FORBIDDEN')
            ? 'صلاحيات حسابك لا تسمح بتعديل هذا المستند.' : 'تعذر تحميل المستند للتعديل. أعد المحاولة.');
        if (!data || data.header?.id !== id || !/^[a-f0-9]{32}$/.test(data.revision) || !Array.isArray(data.items))
            throw new Error('بيانات المستند غير مكتملة. أعد تحميله قبل التعديل.');
        return data as EditableDocument;
    },
    save(kind: DocumentKind, document: EditableDocument, payload: Record<string, unknown>) {
        return factoryCommand<EditableDocument>(`edit_${kind}`, {
            ...payload, id: document.header.id, expected_revision: document.revision,
        });
    },
};
