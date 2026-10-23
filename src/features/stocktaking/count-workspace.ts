import Decimal from 'decimal.js-light';
const Quantity = Decimal.clone({precision:40});
export interface CountChange { item_id: number; counted_quantity: number }
export function validCount(value: string) { return /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1e12 && new Quantity(value).equals(String(Number(value))); }
export function countDifference(value: string, system: number) { return validCount(value) ? new Quantity(value).minus(system).toString() : null; }
export function countChanged(value: string, baseline: number) { return !validCount(value) || !new Quantity(value).equals(baseline); }
export function countUnitTotals(rows: {unit:string;difference:string}[]) {
    const totals = new Map<string,{increase:Decimal;decrease:Decimal}>();
    for(const row of rows) {const total=totals.get(row.unit)??{increase:new Quantity(0),decrease:new Quantity(0)},delta=new Quantity(row.difference);if(delta.isPositive())total.increase=total.increase.plus(delta);else total.decrease=total.decrease.plus(delta.abs());totals.set(row.unit,total);}
    return [...totals].map(([unit,total])=>({unit,increase:total.increase.toString(),decrease:total.decrease.toString()}));
}
// Only a confirmed batch advances the baseline. A failed batch and all following
// rows stay unchanged, so factoryCommand can replay the exact uncertain intent.
export async function saveCountBatches(changes: CountChange[], save: (batch: CountChange[]) => Promise<void>, confirmed: (batch: CountChange[], done: number, total: number) => void) {
    for (let offset = 0; offset < changes.length; offset += 500) {
        const batch = changes.slice(offset, offset + 500);
        await save(batch);
        confirmed(batch, offset + batch.length, changes.length);
    }
}
export function countStatus(status: string) { return ({draft:'مسودة — لم تبدأ',in_progress:'جارٍ العد',completed:'معتمد',cancelled:'ملغي'} as Record<string,string>)[status] || 'حالة غير معروفة'; }
export function stockKind(kind: string) { return ({raw_material:'مواد خام',packaging_material:'مواد تعبئة',semi_finished:'نصف مصنع',finished_product:'منتج نهائي'} as Record<string,string>)[kind] || 'نوع غير معروف'; }
