import Decimal from 'decimal.js-light';
import { formatCurrency, formatQuantity, formatUnitCostCurrency } from './number-format';
const Exact = Decimal.clone({ precision: 40 });
export const formatInventoryQuantity = formatQuantity;
export const formatInventoryCost = formatUnitCostCurrency;
export function formatInventoryValue(quantity: number, unitCost: number) {
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 'غير متاح';
    const value = new Exact(quantity).times(unitCost).toNumber();
    return Number.isFinite(value) ? formatCurrency(value) : 'غير متاح';
}
