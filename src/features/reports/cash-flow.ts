import Decimal from 'decimal.js-light';
import { readCompleteRows, type FetchDataPage } from '../../platform/data/read-complete-rows.ts';
import { cashDirection, cashCategory, type CashEntry } from '../treasuries/treasury-statement.ts';
import { validStatementDay } from '../parties/party-statement.ts';
const Money = Decimal.clone({ precision: 40 });
export type CashPeriodPreset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear';
export interface CashFlowPeriod { from: string; to: string }
export interface CashTreasury { id: number; name: string; currency: string | null }
export interface CashFlowEntry extends CashEntry { treasury_id: number | null }
export interface CashFlowSources { entries: CashFlowEntry[]; treasuries: CashTreasury[] }
export interface CashFlowFetchers { entries: FetchDataPage<CashFlowEntry>; treasuries: FetchDataPage<CashTreasury> }
export interface CashCurrencyOption { key: string; label: string; known: boolean }
export interface CashFlowScope extends CashFlowPeriod { treasuryId: number | null; currencyKey: string; search: string }
export interface CashFlowRow extends CashFlowEntry { treasury: CashTreasury | null; currencyKey: string; direction: 'in' | 'out' | null; amountValue: string | null; transfer: boolean; issues: string[] }
export interface CashFlowTotals { recordedIn: string; recordedOut: string; recordedNet: string; transferIn: string; transferOut: string; transferNet: string; externalIn: string; externalOut: string; externalNet: string }
export function validCashPeriod(period: CashFlowPeriod) { return validStatementDay(period.from) && validStatementDay(period.to) && period.from <= period.to; }
function dayText(date: Date) { return date.toISOString().slice(0, 10); }
export function cashFlowPreset(preset: CashPeriodPreset, today: string): CashFlowPeriod {
    if (!validStatementDay(today)) throw Error('CASH_PERIOD_INVALID');
    const [year, month] = today.split('-').map(Number), offset = { thisMonth: 0, lastMonth: 1, last3Months: 2, last6Months: 5, thisYear: month - 1 }[preset];
    const from = dayText(new Date(Date.UTC(year, month - 1 - offset, 1)));
    const to = dayText(new Date(Date.UTC(year, preset === 'lastMonth' ? month - 1 : month, 0)));
    return { from, to };
}
export async function loadCashFlowSources(fetchers: CashFlowFetchers): Promise<CashFlowSources> {
    const [entries, treasuries] = await Promise.all([readCompleteRows(fetchers.entries, 'CASH_FLOW_ENTRIES'), readCompleteRows(fetchers.treasuries, 'CASH_FLOW_TREASURIES')]);
    return { entries, treasuries };
}
function currencyOption(treasury: CashTreasury): CashCurrencyOption {
    const currency = treasury.currency?.trim().toUpperCase();
    return currency ? { key: `currency:${currency}`, label: currency, known: true }
        : { key: `unknown:${treasury.id}`, label: `عملة غير محددة — ${treasury.name}`, known: false };
}
export function cashFlowOptions(sources: CashFlowSources, treasuryId: number | null): CashCurrencyOption[] {
    const options = new Map<string, CashCurrencyOption>();
    for (const treasury of sources.treasuries) if (treasuryId === null || treasury.id === treasuryId) { const option = currencyOption(treasury); options.set(option.key, option); }
    const ids = new Set(sources.treasuries.map(treasury => treasury.id));
    if (sources.entries.some(row => (treasuryId === null || row.treasury_id === treasuryId) && !ids.has(row.treasury_id!)))
        options.set('unassigned', { key: 'unassigned', label: 'حركات بلا خزنة متاحة', known: false });
    return [...options.values()].sort((a, b) => a.key === b.key ? 0 : a.key === 'currency:EGP' ? -1 : b.key === 'currency:EGP' ? 1 : a.label.localeCompare(b.label, 'ar'));
}
function cashAmount(value: number | string) {
    if (String(value).trim() === '') return null;
    try { const amount = new Money(value); return amount.gt(0) && Number.isFinite(amount.toNumber()) ? amount.toString() : null; }
    catch { return null; } // Malformed historical values are shown for review, never counted as zero.
}
function reviewRow(entry: CashFlowEntry, treasuries: Map<number, CashTreasury>): CashFlowRow {
    const treasury = treasuries.get(entry.treasury_id!) ?? null, direction = cashDirection(entry), amountValue = cashAmount(entry.amount), issues: string[] = [];
    if (!treasury) issues.push('الخزنة المرتبطة غير متاحة');
    else if (!treasury.currency?.trim()) issues.push('عملة الخزنة غير محددة');
    if (!direction) issues.push('اتجاه الحركة غير معروف');
    if (amountValue === null) issues.push('المبلغ غير صالح');
    if (!validStatementDay(entry.transaction_date)) issues.push('تاريخ الحركة غير صالح');
    return { ...entry, treasury, currencyKey: treasury ? currencyOption(treasury).key : 'unassigned', direction, amountValue,
        transfer: entry.category === 'transfer_in' || entry.category === 'transfer_out', issues };
}
function sumCashRows(rows: CashFlowRow[]): CashFlowTotals {
    let externalIn = new Money(0), externalOut = new Money(0), transferIn = new Money(0), transferOut = new Money(0);
    for (const row of rows) {
        const amount = new Money(row.amountValue!);
        if (row.transfer) { if (row.direction === 'in') transferIn = transferIn.plus(amount); else transferOut = transferOut.plus(amount); }
        else if (row.direction === 'in') externalIn = externalIn.plus(amount); else externalOut = externalOut.plus(amount);
    }
    const recordedIn = externalIn.plus(transferIn), recordedOut = externalOut.plus(transferOut);
    return { recordedIn: recordedIn.toString(), recordedOut: recordedOut.toString(), recordedNet: recordedIn.minus(recordedOut).toString(),
        transferIn: transferIn.toString(), transferOut: transferOut.toString(), transferNet: transferIn.minus(transferOut).toString(),
        externalIn: externalIn.toString(), externalOut: externalOut.toString(), externalNet: externalIn.minus(externalOut).toString() };
}
function cashBreakdown(rows: CashFlowRow[]) {
    const categories = new Map<string, { key: string; label: string; direction: 'in' | 'out'; amount: Decimal }>();
    for (const row of rows.filter(row => !row.transfer)) {
        const key = `${row.direction}:${row.category ?? ''}`, previous = categories.get(key);
        categories.set(key, { key, label: cashCategory(row.category), direction: row.direction!, amount: (previous?.amount ?? new Money(0)).plus(row.amountValue!) });
    }
    return [...categories.values()].map(row => ({ ...row, amount: row.amount.toString() }));
}
function cashMonths(rows: CashFlowRow[]) {
    const months = new Map<string, CashFlowRow[]>();
    for (const row of rows) { const month = row.transaction_date.slice(0, 7), group = months.get(month) ?? []; group.push(row); months.set(month, group); }
    return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, movements]) => ({ month, ...sumCashRows(movements) }));
}
function matchesCashSearch(row: CashFlowRow, search: string) {
    return `FT-${row.id} ${row.description ?? ''} ${row.treasury?.name ?? ''} ${row.party?.name ?? ''} ${cashCategory(row.category)} ${row.transaction_date}`.toLocaleLowerCase('ar').includes(search);
}
export function buildCashFlow(sources: CashFlowSources, scope: CashFlowScope) {
    if (!validCashPeriod(scope)) throw Error('CASH_PERIOD_INVALID');
    const selectedCurrency = cashFlowOptions(sources, scope.treasuryId).find(option => option.key === scope.currencyKey);
    if (!selectedCurrency) throw Error('CASH_CURRENCY_REQUIRED');
    const treasuries = new Map(sources.treasuries.map(row => [row.id, row])), search = scope.search.trim().toLocaleLowerCase('ar');
    const inScope = sources.entries.filter(row => (scope.treasuryId === null || row.treasury_id === scope.treasuryId) &&
        (!validStatementDay(row.transaction_date) || (row.transaction_date >= scope.from && row.transaction_date <= scope.to))).map(row => reviewRow(row, treasuries));
    const matchingRows = inScope.filter(row => matchesCashSearch(row, search));
    const unknownCurrencyRows = matchingRows.filter(row => row.treasury === null || !row.treasury.currency?.trim());
    const rows = matchingRows.filter(row => row.currencyKey === scope.currencyKey)
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id);
    const invalidRows = rows.filter(row => row.issues.length > 0), totalsBlocked = !selectedCurrency.known || invalidRows.length > 0 || unknownCurrencyRows.length > 0;
    const summary = totalsBlocked ? null : sumCashRows(rows);
    return { rows, summary, invalidRows, unknownCurrencyRows, currency: selectedCurrency, scope,
        monthly: summary ? cashMonths(rows) : [], breakdown: summary ? cashBreakdown(rows) : [],
        unbalancedTransfers: !!summary && scope.treasuryId === null && search === '' && !new Money(summary.transferNet).eq(0) };
}
export type CashFlowView = ReturnType<typeof buildCashFlow>;
