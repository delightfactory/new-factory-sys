import { supabase } from '@/integrations/supabase/client';
import { readCompleteRows } from '@/platform/data/read-complete-rows';
import { buildStatement, loadStatementRows, type StatementEntry } from '@/features/parties/party-statement';
export interface StatementParty {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    balance: number;
    phone: string | null;
    email: string | null;
    address: string | null;
    created_at: string;
}
export interface PartyInvoice {
    id: number;
    invoice_number: string | null;
    transaction_date: string;
    total_amount: number;
    paid_amount: number;
    status: string;
}
export const PartyStatementService = { async get(id: string) {
        const partyResult = await supabase.from('parties').select('id,name,type,balance,phone,email,address,created_at').eq('id', id).maybeSingle();
        if (partyResult.error)
            throw Error('PARTY_READ_FAILED');
        if (!partyResult.data)
            return null;
        const party = partyResult.data as StatementParty;
        if (!['customer', 'supplier'].includes(party.type) || !Number.isFinite(party.balance))
            throw Error('PARTY_DATA_INVALID');
        const sale = party.type === 'customer';
        const [entries, invoices] = await Promise.all([
            loadStatementRows(async (from, to) => { const r = await supabase.from('ledger_entries').select('id,transaction_date,created_at,reference_type,reference_id,description,debit,credit', { count: 'exact' }).eq('party_id', id).order('transaction_date').order('created_at').order('id').range(from, to); return { rows: r.data as StatementEntry[] | null, count: r.count, error: r.error }; }),
            readCompleteRows<PartyInvoice>(async (from, to) => { const r = await supabase.from(sale ? 'sales_invoices' : 'purchase_invoices').select('id,invoice_number,transaction_date,total_amount,paid_amount,status', { count: 'exact' }).eq(sale ? 'customer_id' : 'supplier_id', id).order('id').range(from, to); return { rows: r.data as PartyInvoice[] | null, count: r.count, error: r.error }; }, 'PARTY_INVOICES')
        ]);
        buildStatement(entries, party.balance);
        if (invoices.some(i => !Number.isFinite(i.total_amount) || !Number.isFinite(i.paid_amount)))
            throw Error('PARTY_INVOICE_INVALID');
        return { party, entries, invoices };
    } };
