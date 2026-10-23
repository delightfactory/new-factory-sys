import { supabase } from '@/integrations/supabase/client';
import { checkedMovementPage, MOVEMENT_PAGE_SIZE, movementItemTypes, type InventoryMovement, type movementScope } from '@/features/inventory/movement-page';

export async function readMovementPage(scope: ReturnType<typeof movementScope>) {
    let query = supabase.from('inventory_movements').select('*', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(scope.page * MOVEMENT_PAGE_SIZE, (scope.page + 1) * MOVEMENT_PAGE_SIZE - 1);
    if (scope.itemType !== 'all') query = query.eq('item_type', scope.itemType);
    if (scope.itemId) query = query.eq('item_id', scope.itemId);
    if (scope.movementType !== 'all') query = query.eq('movement_type', scope.movementType);
    const { data, count, error } = await query;
    if (error) throw error;
    const result = checkedMovementPage(data as InventoryMovement[], count, scope.page);
    const names = new Map<string, string>();
    await Promise.all(movementItemTypes.map(async type => {
        const ids = [...new Set(result.rows.filter(row => row.item_type === type).map(row => row.item_id))];
        if (!ids.length) return;
        const { data: items, error: lookupError } = await supabase.from(type).select('id,name').in('id', ids);
        if (lookupError) throw lookupError;
        for (const item of items ?? []) names.set(`${type}:${item.id}`, item.name);
    }));
    return { ...result, rows: result.rows.map(row => ({ ...row, item_name: names.get(`${row.item_type}:${row.item_id}`) ?? `صنف غير متاح #${row.item_id}` })) };
}
