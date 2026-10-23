import { formatCurrency, formatQuantity } from '@/lib/number-format';
import Decimal from 'decimal.js-light';
import {csvText} from '../../platform/export/csv.ts';
import {readCompleteRows, type FetchDataPage} from '../../platform/data/read-complete-rows.ts';
const Value = Decimal.clone({precision: 40});
export const VALUATION_TYPES = {
    raw: {label: 'مادة خام', path: '/inventory/raw-materials'},
    packaging: {label: 'مادة تعبئة', path: '/inventory/packaging'},
    semi: {label: 'نصف مصنع', path: '/inventory/semi-finished'},
    finished: {label: 'منتج نهائي', path: '/inventory/finished'},
    bundle: {label: 'باندل نشط', path: '/inventory/bundles'},
} as const;
export type ValuationType = keyof typeof VALUATION_TYPES;
export interface ValuationItem {id: number; name: string; code: string; quantity: string | null; unit_cost: string | null; unit?: string | null}
export type ValuationSources = Record<ValuationType, ValuationItem[]>;
export type ValuationFetchers = Record<ValuationType, FetchDataPage<ValuationItem>>;
export interface ValuationRow extends ValuationItem {key: string; type: ValuationType; quantityValue: string | null; costValue: string | null; value: string | null; issues: string[]}
export async function loadValuationSources(fetchers: ValuationFetchers): Promise<ValuationSources> {
    const entries = await Promise.all((Object.keys(VALUATION_TYPES) as ValuationType[]).map(async type => [type, await readCompleteRows(fetchers[type], 'VALUATION_' + type)] as const));
    return Object.fromEntries(entries) as ValuationSources;
}
function numeric(value: string | null, negative: boolean): Decimal | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {const parsed = new Value(value); return !negative && parsed.lt(0) ? null : parsed;} catch {return null;}
}
export function buildValuation(sources: ValuationSources, scope: {type: ValuationType | 'all'; search: string}) {
    const search = scope.search.trim().toLocaleLowerCase('ar');
    const rows: ValuationRow[] = [];
    for (const type of Object.keys(VALUATION_TYPES) as ValuationType[]) {
        if (scope.type !== 'all' && scope.type !== type) continue;
        for (const item of sources[type]) {
            if (search && !(item.name+' '+item.code).toLocaleLowerCase('ar').includes(search)) continue;
            const quantity = numeric(item.quantity, true), cost = numeric(item.unit_cost, false), issues: string[] = [];
            if (!quantity) issues.push('الكمية غير متاحة أو غير صالحة');
            if (!cost) issues.push('تكلفة الوحدة غير متاحة أو غير صالحة');
            rows.push({...item, key: type+':'+item.id, type, quantityValue: quantity?.toFixed() ?? null, costValue: cost?.toFixed() ?? null,
                value: quantity && cost ? quantity.times(cost).toFixed() : null, issues});
        }
    }
    rows.sort((a, b) => a.value === null ? b.value === null ? a.key.localeCompare(b.key) : -1 : b.value === null ? 1 : new Value(b.value).cmp(a.value) || a.key.localeCompare(b.key));
    const invalidCount = rows.filter(row => row.value === null).length;
    return {rows, invalidCount, total: invalidCount ? null : rows.reduce((sum, row) => sum.plus(row.value!), new Value(0)).toFixed(), scope};
}
export type ValuationView = ReturnType<typeof buildValuation>;
export function formatValuationNumber(value: string | null, money = false): string {
    if (value === null) return 'غير متاح';
    return money ? formatCurrency(value) : formatQuantity(value);
}
export function valuationCsv(view: ValuationView, capturedAt: string): string {
    if (view.invalidCount) throw Error('VALUATION_REVIEW_REQUIRED');
    const table = [
        ['تقرير تقييم المخزون — الأرصدة والتكلفة الحالية'],
        ['اكتملت القراءة', capturedAt],
        ['النوع', view.scope.type === 'all' ? 'جميع الأنواع' : VALUATION_TYPES[view.scope.type].label, 'البحث', view.scope.search],
        ['الكود', 'الصنف', 'النوع', 'الوحدة', 'الكمية', 'تكلفة الوحدة EGP', 'القيمة EGP'],
        ...view.rows.map(row => [row.code, row.name, VALUATION_TYPES[row.type].label, row.unit ?? '', row.quantityValue!, row.costValue!, row.value!]),
        ['إجمالي نفس الفلتر', '', '', '', '', '', view.total!],
    ];
    return '\uFEFF'+table.map(row => row.map((value, index) => index >= 4 && /^-?\d+(\.\d+)?$/.test(value) ? value : csvText(value)).join(',')).join('\r\n');
}
