import { supabase } from '@/integrations/supabase/client';
import { loadProductionReport, type ReportOrderRow, type OrderType } from '@/features/reports/production-report';

const page = (type: OrderType) => async (from: number, to: number) => {
    const { data, count, error } = await supabase.from(`${type}_orders`)
        .select('id,code,status,created_at', { count: 'exact' })
        .order('id', { ascending: true }).range(from, to);
    return { rows: data as ReportOrderRow[] | null, count, error };
};

export const ProductionReportService = {
    get: () => loadProductionReport({ production: page('production'), packaging: page('packaging') }),
};
