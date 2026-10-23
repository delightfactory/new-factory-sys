import { readCompleteRows, type FetchDataPage } from '../../platform/data/read-complete-rows.ts';

export type OrderType = 'production' | 'packaging';
export type StatusFilter = 'all' | 'pending' | 'inProgress' | 'completed' | 'cancelled' | 'unknown';
export interface ReportOrderRow { id: number; code: string | null; status: string | null; created_at: string | null }
export interface ReportOrder extends ReportOrderRow { type: OrderType }
export interface OrderStats { total: number; completed: number; inProgress: number; pending: number; cancelled: number; efficiencyRate: number }
export interface OrderGroup { orders: ReportOrder[]; stats: OrderStats }
export interface ProductionReportData { production: OrderGroup; packaging: OrderGroup; combined: OrderGroup }
const known = new Set(['pending', 'inProgress', 'completed', 'cancelled']);

function summarize(orders: ReportOrder[]): OrderGroup {
    const completed = orders.filter(order => order.status === 'completed').length;
    return { orders, stats: { total: orders.length, completed,
        inProgress: orders.filter(order => order.status === 'inProgress').length,
        pending: orders.filter(order => order.status === 'pending').length,
        cancelled: orders.filter(order => order.status === 'cancelled').length,
        efficiencyRate: orders.length ? Math.round(completed / orders.length * 100) : 0,
    } };
}

export async function loadProductionReport(fetchers: Record<OrderType, FetchDataPage<ReportOrderRow>>): Promise<ProductionReportData> {
    const read = async (type: OrderType) => {
        const rows = await readCompleteRows(fetchers[type], `REPORT_${type.toUpperCase()}`);
        const orders = rows.map(row => ({ ...row, type })).sort((a, b) =>
            (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id - a.id);
        return summarize(orders);
    };
    const [production, packaging] = await Promise.all([read('production'), read('packaging')]);
    return { production, packaging, combined: summarize([...production.orders, ...packaging.orders]) };
}

export function filterProductionReport(data: ProductionReportData, status: StatusFilter): ProductionReportData {
    if (status === 'all') return data;
    const matches = (order: ReportOrder) => status === 'unknown' ? !known.has(order.status ?? '') : order.status === status;
    const production = summarize(data.production.orders.filter(matches));
    const packaging = summarize(data.packaging.orders.filter(matches));
    return { production, packaging, combined: summarize([...production.orders, ...packaging.orders]) };
}

