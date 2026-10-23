import { readCompleteRows } from '../../platform/data/read-complete-rows.ts';
import type { DataPage } from '../../platform/data/read-complete-rows.ts';

export interface InventoryItem {
    id: string | number;
    name: string;
    code: string;
    quantity: number;
    unit_cost: number;
}

export interface OutgoingMovement {
    id: string | number;
    item_id: string;
    item_type: string;
    movement_type: string;
    quantity: number;
}

export interface TurnoverRows {
    raw_materials: InventoryItem;
    packaging_materials: InventoryItem;
    semi_finished_products: InventoryItem;
    finished_products: InventoryItem;
    inventory_movements: OutgoingMovement;
}

export type ReadTurnoverPage = <Table extends keyof TurnoverRows>(
    table: Table, from: number, to: number, since: string
) => Promise<DataPage<TurnoverRows[Table]>>;

// One fixed cutoff and one result: never expose a partially loaded report.
// Count/identity checks detect truncation, not same-count concurrent edits.
export async function readTurnoverData(readPage: ReadTurnoverPage, since: string) {
    const read = <Table extends keyof TurnoverRows>(table: Table) =>
        readCompleteRows((from, to) => readPage(table, from, to, since));
    const [rawMaterials, packagingMaterials, semiFinished, finished, movements] = await Promise.all([
        read('raw_materials'), read('packaging_materials'), read('semi_finished_products'),
        read('finished_products'), read('inventory_movements')
    ]);
    return { rawMaterials, packagingMaterials, semiFinished, finished, movements };
}
