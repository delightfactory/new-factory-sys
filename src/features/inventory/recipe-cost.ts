import Decimal from 'decimal.js-light';

const Exact = Decimal.clone({ precision: 40 });
interface MaterialCost { id: number; unit_cost: number | string | null }
interface CostInput { materialId: string; quantity: number }
function number(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') return null;
    try { const result = new Exact(value); return Number.isFinite(result.toNumber()) && result.gte(0) ? result : null; }
    catch { return null; }
}
// Arithmetic retains decimal precision until the existing numeric command boundary.
function commandNumber(value: Decimal) {
    const result = value.toNumber();
    return Number.isFinite(result) && (result !== 0 || value.isZero()) ? result : null;
}
function lineTotal(lines: CostInput[], materials: readonly MaterialCost[] | undefined) {
    if (!materials) return null;
    let sum = new Exact(0);
    for (const line of lines) {
        const cost = number(materials.find(row => String(row.id) === line.materialId)?.unit_cost);
        const quantity = number(line.quantity);
        if (!cost || !quantity || quantity.lte(0)) return null;
        sum = sum.plus(cost.times(quantity));
    }
    return sum;
}
export function semiRecipeCost(lines: CostInput[], materials: readonly MaterialCost[] | undefined, batchSize: number) {
    const total = lineTotal(lines, materials), batch = number(batchSize);
    return { totalCost: total ? commandNumber(total) : null,
        unitCost: total && batch?.gt(0) ? commandNumber(total.div(batch)) : null };
}
export function finishedRecipeCost(baseId: string, baseQuantity: number, bases: readonly MaterialCost[] | undefined,
    packaging: CostInput[], materials: readonly MaterialCost[] | undefined) {
    if (!bases) return null;
    const packs = lineTotal(packaging, materials);
    if (!packs) return null;
    if (!baseId) return commandNumber(packs);
    const base = lineTotal([{ materialId: baseId, quantity: baseQuantity }], bases);
    return base ? commandNumber(base.plus(packs)) : null;
}
