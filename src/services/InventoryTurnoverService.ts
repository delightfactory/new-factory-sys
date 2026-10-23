import { supabase } from '@/integrations/supabase/client';
import { readTurnoverData } from '@/features/reports/inventory-turnover-data';
import type { ReadTurnoverPage, TurnoverRows } from '@/features/reports/inventory-turnover-data';

const readPage: ReadTurnoverPage = async <Table extends keyof TurnoverRows>(table: Table, from: number, to: number, since: string) => {
    const columns = table === 'inventory_movements'
        ? 'id, item_id, item_type, movement_type, quantity'
        : 'id, name, code, quantity, unit_cost';
    let query = supabase.from(table).select(columns, { count: 'exact' });
    if (table === 'inventory_movements') {
        query = query.eq('movement_type', 'out').gte('created_at', since);
    }
    const { data, count, error } = await query.order('id', { ascending: true }).range(from, to).returns<TurnoverRows[Table][]>();
    return { rows: data, count, error };
};

export function loadInventoryTurnover() {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    return readTurnoverData(readPage, since.toISOString());
}
