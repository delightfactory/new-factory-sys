import Decimal from 'decimal.js-light';
import { validStatementDay } from '../parties/party-statement.ts';
const Money = Decimal.clone({ precision: 40 });
export interface CashEntry {
    id: number;
    amount: number | string;
    transaction_type: string;
    category: string | null;
    transaction_date: string;
    created_at: string;
    description?: string | null;
    party_id?: string | null;
    party?: { name: string } | null;
    invoice_id?: number | null;
    invoice_type?: string | null;
    reference_type?: string | null;
    reference_id?: string | null;
}
export function cashDirection(row: CashEntry): 'in' | 'out' | null {
    if (row.transaction_type === 'transfer') return row.category === 'transfer_out' ? 'out' : row.category === 'transfer_in' ? 'in' : null;
    if (row.transaction_type === 'income' && row.category !== 'transfer_out') return 'in';
    if (row.transaction_type === 'expense' && row.category !== 'transfer_in') return 'out';
    return null;
}
export function cashCategory(category: string | null) {
    const labels: Record<string, string> = { receipt: 'تحصيل', payment: 'سداد', sales: 'مبيعات', purchase: 'مشتريات', sales_payment: 'تحصيل فاتورة بيع', purchase_payment: 'سداد فاتورة شراء', refund: 'رد مبلغ', transfer_out: 'تحويل صادر', transfer_in: 'تحويل وارد', manual_deposit: 'إيداع يدوي', manual_withdraw: 'صرف يدوي', sales_void_refund: 'رد تحصيل فاتورة ملغاة', purchase_void_refund: 'استرداد سداد فاتورة ملغاة', salary: 'رواتب', rent: 'إيجار', utilities: 'مرافق', maintenance: 'صيانة' };
    return labels[category ?? ''] ?? (category?.startsWith('reversal_') ? 'عكس حركة' : 'حركة أخرى');
}
export function cashInvoiceHref(row: CashEntry) {
    const linkedSettlement = (row.reference_type === 'sales_invoice' && row.category === 'sales_payment') || (row.reference_type === 'purchase_invoice' && row.category === 'purchase_payment');
    const id = row.invoice_id ?? (linkedSettlement ? Number(row.reference_id) : null);
    const kind = row.invoice_type ?? (linkedSettlement ? row.reference_type === 'sales_invoice' ? 'sales' : 'purchase' : null);
    return id && Number.isSafeInteger(id) && id > 0 && ['sales', 'purchase'].includes(kind ?? '') ? `/commercial/${kind === 'sales' ? 'selling' : 'buying'}/${id}` : null;
}
export function buildTreasuryStatement(entries: CashEntry[], balance: number | string, period = { from: '', to: '' }) {
    if ((period.from && !validStatementDay(period.from)) || (period.to && !validStatementDay(period.to)) || (period.from && period.to && period.from > period.to)) throw Error('CASH_PERIOD_INVALID');
    const value = (n: number | string) => { if (String(n).trim() === '' || !Number.isFinite(Number(n))) throw Error('CASH_AMOUNT_INVALID'); return new Money(n); };
    let net = new Money(0), brought = new Money(0), incoming = new Money(0), outgoing = new Money(0);
    const selected: CashEntry[] = [];
    for (const row of entries) {
        const direction = cashDirection(row), amount = value(row.amount);
        if (!direction || !amount.isPositive() || !validStatementDay(row.transaction_date)) throw Error('CASH_ENTRY_INVALID');
        const delta = direction === 'in' ? amount : amount.negated();
        net = net.plus(delta);
        if (period.from && row.transaction_date < period.from) brought = brought.plus(delta);
        else if (!period.to || row.transaction_date <= period.to) {
            selected.push(row);
            if (direction === 'in') incoming = incoming.plus(amount); else outgoing = outgoing.plus(amount);
        }
    }
    let running = brought;
    const rows = selected.map(row => { running = running.plus(cashDirection(row) === 'in' ? value(row.amount) : value(row.amount).negated()); return { ...row, runningBalance: running.toString() }; });
    return { rows, broughtForward: brought.toString(), incoming: incoming.toString(), outgoing: outgoing.toString(), closing: running.toString(), net: net.toString(), recorded: value(balance).toString(), difference: value(balance).minus(net).toString(), period };
}
export type TreasuryStatement = ReturnType<typeof buildTreasuryStatement>;

export function treasuryCurrency(currency?: string | null) { return currency === 'EGP' ? 'ج.م' : currency?.trim() || 'العملة غير محددة'; }
