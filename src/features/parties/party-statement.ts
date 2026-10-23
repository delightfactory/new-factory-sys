import { formatAmount } from '@/lib/number-format';
import Decimal from 'decimal.js-light';
import { readCompleteRows, type FetchDataPage } from '../../platform/data/read-complete-rows.ts';
const Money = Decimal.clone({ precision: 40 });
export interface StatementEntry {
    id: string;
    transaction_date: string;
    created_at: string;
    reference_type: string | null;
    reference_id: string | null;
    description: string | null;
    debit: number | string;
    credit: number | string;
}
export interface StatementPeriod {
    from: string;
    to: string;
}
export interface StatementRow extends StatementEntry {
    runningBalance: string;
}
export interface StatementResult {
    rows: StatementRow[];
    broughtForward: string;
    debit: string;
    credit: string;
    closing: string;
    ledgerNet: string;
    recordedBalance: string;
    difference: string;
    matches: boolean;
    period: StatementPeriod;
    totalRows: number;
}
function money(value: number | string) { if (value === '' || !Number.isFinite(Number(value)))
    throw Error('STATEMENT_AMOUNT_INVALID'); return new Money(value); }
export function statementMoney(value: number | string) { return formatAmount(value); }
export function balanceDirection(value: number | string) { const n = money(value); return n.isZero() ? 'متوازن' : n.isPositive() ? 'مستحق لنا على الطرف' : 'مستحق للطرف علينا'; }
export function validStatementDay(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function loadStatementRows(fetcher: FetchDataPage<StatementEntry>) { return readCompleteRows(fetcher, 'PARTY_STATEMENT'); }
export function buildStatement(entries: StatementEntry[], recordedBalance: number | string, period: StatementPeriod = { from: '', to: '' }): StatementResult {
    if ((period.from && !validStatementDay(period.from)) || (period.to && !validStatementDay(period.to)) || (period.from && period.to && period.from > period.to))
        throw Error('STATEMENT_PERIOD_INVALID');
    let net = new Money(0), brought = new Money(0), debit = new Money(0), credit = new Money(0);
    const selected: StatementEntry[] = [];
    for (const entry of entries) {
        if (!validStatementDay(entry.transaction_date))
            throw Error('STATEMENT_DATE_INVALID');
        const delta = money(entry.debit).minus(money(entry.credit));
        net = net.plus(delta);
        if (period.from && entry.transaction_date < period.from)
            brought = brought.plus(delta);
        else if (!period.to || entry.transaction_date <= period.to) {
            selected.push(entry);
            debit = debit.plus(money(entry.debit));
            credit = credit.plus(money(entry.credit));
        }
    }
    let running = brought;
    const rows = selected.map(entry => { running = running.plus(money(entry.debit)).minus(money(entry.credit)); return { ...entry, runningBalance: running.toString() }; });
    const recorded = money(recordedBalance), difference = recorded.minus(net);
    return { rows, broughtForward: brought.toString(), debit: debit.toString(), credit: credit.toString(), closing: running.toString(), ledgerNet: net.toString(), recordedBalance: recorded.toString(), difference: difference.toString(), matches: difference.isZero(), period, totalRows: entries.length };
}
export function statementLabel(entry: StatementEntry) { if (entry.id.startsWith('ft_'))
    return entry.reference_type === 'MCP_REVERSAL' ? 'عكس حركة نقدية' : 'حركة نقدية'; const labels: Record<string, string> = { sales_invoice: 'فاتورة بيع', purchase_invoice: 'فاتورة شراء', sales_return: 'مرتجع بيع', purchase_return: 'مرتجع شراء' }; return labels[entry.reference_type ?? ''] ?? 'حركة أخرى'; }
export function statementHref(entry: StatementEntry) { if (entry.id.startsWith('ft_') || !entry.reference_id || !/^\d+$/.test(entry.reference_id) || !Number.isSafeInteger(Number(entry.reference_id)) || Number(entry.reference_id) <= 0)
    return null; const routes: Record<string, string> = { sales_invoice: 'selling', purchase_invoice: 'buying', sales_return: 'returns/sales', purchase_return: 'returns/purchase' }; const route = routes[entry.reference_type ?? '']; return route ? `/commercial/${route}/${entry.reference_id}` : null; }
