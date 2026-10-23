export const MOVEMENT_PAGE_SIZE = 100;
export const movementItemTypes = ['raw_materials', 'packaging_materials', 'semi_finished_products', 'finished_products', 'product_bundles'] as const;
export interface InventoryMovement {
    id: number; item_id: number; item_type: string; movement_type: string; quantity: number;
    previous_balance: number; new_balance: number; reason: string; reference_id: string | null;
    created_at: string; item_name?: string;
}
export interface MovementPage { rows: InventoryMovement[]; count: number }
export function movementScope(params: URLSearchParams) {
    const rawType = params.get('item_type') ?? 'all';
    const itemType = movementItemTypes.some(type => type === rawType) ? rawType : 'all';
    const rawMovement = params.get('movement_type') ?? 'all';
    const movementType = ['in', 'out', 'adjustment'].includes(rawMovement) ? rawMovement : 'all';
    const integer = (value: string | null) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
    const itemId = itemType !== 'all' ? integer(params.get('item_id')) : 0;
    const page = integer(params.get('page'));
    return { itemType, movementType, itemId, page: page <= Math.floor(Number.MAX_SAFE_INTEGER / MOVEMENT_PAGE_SIZE) - 1 ? page : 0 };
}
export function checkedMovementPage(rows: InventoryMovement[] | null, count: number | null, page: number): MovementPage {
    if (count === null || !Number.isSafeInteger(count) || count < 0 || !Array.isArray(rows)) throw new Error('MOVEMENTS_COUNT_UNAVAILABLE');
    const expected = Math.min(MOVEMENT_PAGE_SIZE, Math.max(0, count - page * MOVEMENT_PAGE_SIZE));
    if (rows.length !== expected || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('MOVEMENTS_PAGE_INCOMPLETE');
    return { rows, count };
}
