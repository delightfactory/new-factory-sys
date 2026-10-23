import { formatCurrency, formatQuantity } from '@/lib/number-format';
import Decimal from 'decimal.js-light';
import { readCompleteRows, type FetchDataPage } from '../../platform/data/read-complete-rows.ts';
const Money = Decimal.clone({ precision: 40 });
type Value = number | string | null;
interface Product { id: number; code: string; name: string; sales_price: Value; unit_cost: Value; quantity: Value }
interface Bundle { id: number; code: string; name: string; bundle_price: Value; quantity: Value }
interface Component { name: string; unit_cost: Value }
export interface PerformanceComponent {
    id: number; bundle_id: number; item_type: string; quantity: Value;
    finished_product: Component | null; semi_finished: Component | null;
    raw_material: Component | null; packaging_material: Component | null;
}
export interface PerformanceSale {
    id: number; invoice_id: number; item_type: string; finished_product_id: number | null; bundle_id: number | null;
    quantity: Value; unit_price: Value; sales_invoices: { invoice_number: string; transaction_date: string; status: string };
}
export interface PerformanceSources { products: Product[]; bundles: Bundle[]; components: PerformanceComponent[]; sales: PerformanceSale[] }
export type PerformanceFetchers = { [Key in keyof PerformanceSources]: FetchDataPage<PerformanceSources[Key][number]> };
export interface PerformanceRow {
    key: string; id: number; type: 'product' | 'bundle'; code: string; name: string;
    unitCost: string | null; salesPrice: string | null; quantity: string | null; potentialRevenue: string | null;
    marginAmount: string | null; marginPercent: string | null; totalSold: string | null; totalRevenue: string | null;
    sales: PerformanceSale[]; components: PerformanceComponent[]; warnings: string[];
}
function amount(value: Value | undefined, negative = false) {
    if (value === null || value === undefined || value === '') return null;
    try { const result = new Money(value); return Number.isFinite(result.toNumber()) && (negative || result.gte(0)) ? result : null; }
    catch { return null; }
}
export function performanceComponent(item: PerformanceComponent) {
    switch (item.item_type) {
        case 'finished_product': return item.finished_product;
        case 'semi_finished': return item.semi_finished;
        case 'raw_material': return item.raw_material;
        case 'packaging_material': return item.packaging_material;
        default: return null;
    }
}
function bundleCost(items: PerformanceComponent[]) {
    let cost = new Money(0);
    for (const item of items) {
        const unit = amount(performanceComponent(item)?.unit_cost), quantity = amount(item.quantity);
        if (!unit || !quantity) return null;
        cost = cost.plus(unit.times(quantity));
    }
    return cost;
}
function sum(rows: PerformanceRow[], key: 'totalRevenue' | 'potentialRevenue') {
    if (rows.some(row => row[key] === null)) return null;
    return rows.reduce((total, row) => total.plus(row[key]!), new Money(0)).toString();
}
export function buildProductPerformance(sources: PerformanceSources) {
    const rows: PerformanceRow[] = [];
    for (const entry of [...sources.products.map(product => ({ type: 'product' as const, product })),
        ...sources.bundles.map(product => ({ type: 'bundle' as const, product }))]) {
        const { product, type } = entry;
        const components = type === 'bundle' ? sources.components.filter(item => item.bundle_id === product.id) : [];
        const unitCost = type === 'product' ? amount((product as Product).unit_cost) : bundleCost(components);
        const salesPrice = amount(type === 'product' ? (product as Product).sales_price : (product as Bundle).bundle_price);
        const quantity = amount(product.quantity, true), warnings: string[] = [];
        const margin = unitCost && salesPrice ? salesPrice.minus(unitCost) : null;
        const marginPercent = margin && salesPrice?.gt(0) ? margin.div(salesPrice).times(100).toString() : null;
        if (!unitCost) warnings.push('التكلفة الحالية غير متاحة؛ راجع تعريف الصنف أو مكونات الباندل.');
        if (!salesPrice || !quantity) warnings.push('السعر أو الرصيد الحالي غير صالح للحساب.');
        rows.push({ key: `${type}:${product.id}`, id: product.id, type, name: product.name, code: product.code,
            unitCost: unitCost?.toString() ?? null, salesPrice: salesPrice?.toString() ?? null, quantity: quantity?.toString() ?? null,
            potentialRevenue: quantity && salesPrice ? quantity.times(salesPrice).toString() : null,
            marginAmount: margin?.toString() ?? null, marginPercent, totalSold: '0', totalRevenue: '0', sales: [], components, warnings });
    }
    const byKey = new Map(rows.map(row => [row.key, row]));
    let excludedSales = 0;
    for (const sale of sources.sales) {
        // Bundles are sold as bundles: never attribute their sale to each component as well.
        const key = sale.item_type === 'bundle' && sale.bundle_id ? `bundle:${sale.bundle_id}` :
            sale.item_type === 'finished_product' && sale.finished_product_id ? `product:${sale.finished_product_id}` : null;
        const row = key ? byKey.get(key) : undefined;
        if (!row) { excludedSales++; continue; }
        row.sales.push(sale);
        const quantity = amount(sale.quantity), price = amount(sale.unit_price);
        if (!quantity || !price || sale.sales_invoices.status !== 'posted') {
            row.totalSold = null; row.totalRevenue = null;
            row.warnings.push(`تعذر احتساب بند البيع #${sale.id}؛ راجع الكمية والسعر وحالة الفاتورة.`);
        } else if (row.totalRevenue !== null && row.totalSold !== null) {
            row.totalSold = new Money(row.totalSold).plus(quantity).toString();
            row.totalRevenue = new Money(row.totalRevenue).plus(quantity.times(price)).toString();
        }
    }
    const products = rows.filter(row => row.type === 'product');
    const averageMargin = products.length && products.every(row => row.marginPercent !== null) ?
        products.reduce((total, row) => total.plus(row.marginPercent!), new Money(0)).div(products.length).toString() : null;
    const topRevenue = rows.filter(row => row.totalRevenue !== null && new Money(row.totalRevenue).gt(0))
        .sort((a, b) => new Money(b.totalRevenue!).cmp(a.totalRevenue!)).slice(0, 8);
    return { rows, excludedSales, totalRevenue: sum(rows, 'totalRevenue'), totalPotential: sum(rows, 'potentialRevenue'), averageMargin, topRevenue };
}
export async function loadPerformanceSources(fetchers: PerformanceFetchers): Promise<PerformanceSources> {
    const [products, bundles, components, sales] = await Promise.all([
        readCompleteRows(fetchers.products, 'PERFORMANCE_PRODUCTS'), readCompleteRows(fetchers.bundles, 'PERFORMANCE_BUNDLES'),
        readCompleteRows(fetchers.components, 'PERFORMANCE_COMPONENTS'), readCompleteRows(fetchers.sales, 'PERFORMANCE_SALES')]);
    return { products, bundles, components, sales };
}
export function formatPerformanceNumber(value: string | null, money = false): string {
    if (value === null) return 'غير متاح';
    const parsed = amount(value, true);
    if (!parsed) return 'غير متاح';
    return money ? formatCurrency(parsed.toFixed()) : formatQuantity(parsed.toFixed());
}
