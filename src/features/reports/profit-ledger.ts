import Decimal from 'decimal.js-light';
import {readCompleteRows, type FetchDataPage} from '../../platform/data/read-complete-rows.ts';
import {validStatementDay} from '../parties/party-statement.ts';
import {csvText} from '../../platform/export/csv.ts';
const Money = Decimal.clone({precision: 40});
export interface ProfitPeriod {from: string; to: string}
export interface ProfitInvoice {id: number; status: string; transaction_date: string; total_amount: string | null}
export interface ProfitReturn {id: number; status: string; return_date: string; total_amount: string | null}
export interface ProfitFinance {id: number; transaction_date: string; transaction_type: string; category: string | null; amount: string | null}
export interface ProfitCategory {id: number; name: string; type: string}
export interface ProfitSaleCost {id: number; quantity: string | null; unit_cost_at_sale: string | null; sales_invoices: {status: string; transaction_date: string} | null}
export interface ProfitReturnCost {id: number; quantity: string | null; unit_cost_at_return: string | null; sales_returns: {status: string; return_date: string} | null}
export interface ProfitSources {sales: ProfitInvoice[]; returns: ProfitReturn[]; finance: ProfitFinance[]; categories: ProfitCategory[]; salesCosts: ProfitSaleCost[]; returnCosts: ProfitReturnCost[]; purchases: ProfitInvoice[]}
export type ProfitFetchers = {[K in keyof Omit<ProfitSources, 'purchases'>]: FetchDataPage<ProfitSources[K][number]>} & {purchases?: FetchDataPage<ProfitInvoice>};
const COMPONENTS = ['salesRevenue', 'returnsAmount', 'manualRevenue', 'salesCOGS', 'returnCOGS', 'expenses', 'purchases'] as const;
type Component = typeof COMPONENTS[number];
type Components = Record<Component, string>;
export type ProfitTotals = Components & {revenue: string; cogs: string; grossProfit: string; netProfit: string};
export interface ProfitPoint extends ProfitTotals {date: string}
export function validProfitPeriod(period: ProfitPeriod) {return validStatementDay(period.from) && validStatementDay(period.to) && period.from <= period.to;}
export async function loadProfitSources(fetchers: ProfitFetchers): Promise<ProfitSources> {
    async function read<K extends keyof ProfitSources>(key: K): Promise<ProfitSources[K]> {
        const fetcher = fetchers[key];
        if (!fetcher) {
            if (key !== 'purchases') throw Error('PROFIT_SOURCE_REQUIRED:'+key);
            return [] as ProfitSources[K];
        }
        return await readCompleteRows(fetcher as FetchDataPage<ProfitSources[K][number]>, 'PROFIT_'+key) as ProfitSources[K];
    }
    const [sales, returns, finance, categories, salesCosts, returnCosts, purchases] = await Promise.all([
        read('sales'), read('returns'), read('finance'), read('categories'), read('salesCosts'), read('returnCosts'), read('purchases'),
    ]);
    return {sales, returns, finance, categories, salesCosts, returnCosts, purchases};
}
function amount(value: string | null, source: string, id: number): Decimal {
    if (typeof value !== 'string' || !value.trim()) throw Error(`PROFIT_AMOUNT_INVALID:${source}:${id}`);
    try {return new Money(value);} catch {throw Error(`PROFIT_AMOUNT_INVALID:${source}:${id}`);}
}
function zeroComponents(): Components {return Object.fromEntries(COMPONENTS.map(key => [key, '0'])) as Components;}
function derive(components: Components): ProfitTotals {
    const revenue = new Money(components.salesRevenue).minus(components.returnsAmount).plus(components.manualRevenue);
    const cogs = new Money(components.salesCOGS).minus(components.returnCOGS), grossProfit = revenue.minus(cogs);
    return {...components, revenue: revenue.toFixed(), cogs: cogs.toFixed(), grossProfit: grossProfit.toFixed(), netProfit: grossProfit.minus(components.expenses).toFixed()};
}
function sumComponents(points: Components[]): Components {
    return Object.fromEntries(COMPONENTS.map(key => [key, points.reduce((sum, point) => sum.plus(point[key]), new Money(0)).toFixed()])) as Components;
}
export function buildProfit(sources: ProfitSources, period: ProfitPeriod) {
    if (!validProfitPeriod(period)) throw Error('PROFIT_PERIOD_INVALID');
    const days = new Map<string, Components>();
    const diagnostics = {missingSalesCost: 0, missingReturnCost: 0, excludedIncomeCount: 0, excludedIncomeAmount: '0', excludedExpenseCount: 0, excludedExpenseAmount: '0'};
    const incomeNames = new Set(sources.categories.filter(row => row.type === 'income').map(row => row.name));
    const expenseNames = new Set(sources.categories.filter(row => row.type === 'expense').map(row => row.name));
    const inPeriod = (date: string) => {
        if (!validStatementDay(date)) throw Error('PROFIT_DATE_INVALID');
        return date >= period.from && date <= period.to;
    };
    const add = (date: string, key: Component, value: Decimal) => {
        const current = days.get(date) ?? zeroComponents();
        current[key] = new Money(current[key]).plus(value).toFixed(); days.set(date, current);
    };
    for (const [key, rows] of [['salesRevenue', sources.sales], ['purchases', sources.purchases]] as const) for (const row of rows) {
        if (row.status === 'posted' && inPeriod(row.transaction_date)) add(row.transaction_date, key, amount(row.total_amount, key, row.id));
    }
    for (const row of sources.returns) if (row.status === 'posted' && inPeriod(row.return_date)) add(row.return_date, 'returnsAmount', amount(row.total_amount, 'returns', row.id));
    for (const row of sources.finance) {
        if (!inPeriod(row.transaction_date) || !['income', 'expense'].includes(row.transaction_type)) continue;
        const value = amount(row.amount, 'finance', row.id), income = row.transaction_type === 'income';
        if (row.category !== null && (income ? incomeNames : expenseNames).has(row.category)) add(row.transaction_date, income ? 'manualRevenue' : 'expenses', value);
        else if (income) {diagnostics.excludedIncomeCount++; diagnostics.excludedIncomeAmount = new Money(diagnostics.excludedIncomeAmount).plus(value).toFixed();}
        else {diagnostics.excludedExpenseCount++; diagnostics.excludedExpenseAmount = new Money(diagnostics.excludedExpenseAmount).plus(value).toFixed();}
    }
    for (const row of sources.salesCosts) {
        if (!row.sales_invoices) throw Error('PROFIT_SALES_PARENT_UNAVAILABLE');
        if (row.sales_invoices.status !== 'posted' || !inPeriod(row.sales_invoices.transaction_date)) continue;
        if (row.unit_cost_at_sale === null) diagnostics.missingSalesCost++;
        const cost = row.unit_cost_at_sale === null ? new Money(0) : amount(row.unit_cost_at_sale, 'salesCosts', row.id);
        add(row.sales_invoices.transaction_date, 'salesCOGS', amount(row.quantity, 'salesQuantity', row.id).times(cost));
    }
    for (const row of sources.returnCosts) {
        if (!row.sales_returns) throw Error('PROFIT_RETURN_PARENT_UNAVAILABLE');
        if (row.sales_returns.status !== 'posted' || !inPeriod(row.sales_returns.return_date)) continue;
        if (row.unit_cost_at_return === null) diagnostics.missingReturnCost++;
        const cost = row.unit_cost_at_return === null ? new Money(0) : amount(row.unit_cost_at_return, 'returnCosts', row.id);
        add(row.sales_returns.return_date, 'returnCOGS', amount(row.quantity, 'returnQuantity', row.id).times(cost));
    }
    const start = Date.parse(period.from), end = Date.parse(period.to), daily: ProfitPoint[] = [];
    for (let time = start; time <= end; time += 86400000) {
        const date = new Date(time).toISOString().slice(0, 10); daily.push({date, ...derive(days.get(date) ?? zeroComponents())});
    }
    const months = new Map<string, ProfitPoint[]>();
    for (const point of daily) {const key = point.date.slice(0, 7), group = months.get(key) ?? []; group.push(point); months.set(key, group);}
    const monthly = [...months].map(([date, points]) => ({date, ...derive(sumComponents(points))}));
    const summary = derive(sumComponents(monthly));
    return {period, daily, monthly, summary, diagnostics, sourceCounts: Object.fromEntries(Object.entries(sources).map(([key, rows]) => [key, rows.length])), basis: {
        currency: 'EGP', categories: 'current exact configured names', nullHistoricalCost: 'zero with diagnostic, preserving existing P&L', invoiceTotals: 'stored totals including existing tax/shipping/discount; no reallocation', purchases: 'independent indicator, never deducted from profit', dates: 'invoice transaction_date / return return_date / finance transaction_date',
    }};
}
export type ProfitReport = ReturnType<typeof buildProfit>;
export function profitComparison(current: string, previous: string) {
    const before = new Money(previous), delta = new Money(current).minus(before);
    return {delta: delta.toFixed(), percent: before.gt(0) ? delta.div(before).times(100).toFixed() : null};
}
export function profitCsv(report: ProfitReport, grouping: 'daily' | 'monthly', capturedAt: string) {
    const keys = ['salesRevenue', 'returnsAmount', 'manualRevenue', 'revenue', 'salesCOGS', 'returnCOGS', 'cogs', 'grossProfit', 'expenses', 'netProfit', 'purchases'] as const;
    const textRows = [
        ['تقرير الأرباح والخسائر والاتجاهات', 'EGP'], ['من', report.period.from, 'إلى', report.period.to], ['اكتملت القراءة', capturedAt],
        ['الأساس', 'المبيعات - المرتجعات + الإيراد المصنف - صافي التكلفة التاريخية - المصروف المصنف؛ المشتريات مؤشر مستقل'],
        ['تشخيص التكلفة التاريخية الفارغة', String(report.diagnostics.missingSalesCost), String(report.diagnostics.missingReturnCost)],
        ['حركات مستبعدة لعدم إعداد البند', String(report.diagnostics.excludedIncomeCount), report.diagnostics.excludedIncomeAmount, String(report.diagnostics.excludedExpenseCount), report.diagnostics.excludedExpenseAmount],
    ].map(row => row.map(csvText).join(','));
    const header = ['الفترة', 'المبيعات المعتمدة', 'المرتجعات', 'الإيراد الآخر المصنف', 'صافي الإيراد', 'تكلفة البيع', 'تكلفة المرتجع', 'صافي التكلفة', 'مجمل الربح', 'المصروف المصنف', 'صافي الربح', 'المشتريات المعتمدة'].map(csvText).join(',');
    const rows = report[grouping].map(point => [csvText(point.date), ...keys.map(key => point[key])].join(','));
    rows.push([csvText('إجمالي الفترة'), ...keys.map(key => report.summary[key])].join(','));
    return '\uFEFF'+[...textRows, header, ...rows].join('\r\n');
}

// Legacy dashboards consume numbers; the financial screens consume exact strings.
export function legacyProfitResult(report: ProfitReport) {
    const keys = ['revenue', 'cogs', 'grossProfit', 'expenses', 'netProfit', 'salesRevenue', 'manualRevenue', 'returnsAmount', 'salesCOGS', 'returnCOGS'] as const;
    const values = Object.fromEntries(keys.map(key => {
        const value = Number(report.summary[key]);
        if (!Number.isFinite(value)) throw Error('PROFIT_LEGACY_NUMBER_RANGE');
        return [key, value];
    })) as Record<typeof keys[number], number>;
    return {...values, exact: report.summary, diagnostics: report.diagnostics, basis: report.basis};
}
