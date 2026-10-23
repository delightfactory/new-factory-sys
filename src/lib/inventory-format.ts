import Decimal from 'decimal.js-light';
const Exact = Decimal.clone({ precision: 40 });
// Stored values use their available numeric precision; editors never parse this display text.
export const formatInventoryQuantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 }).format;
export const formatInventoryCost = new Intl.NumberFormat('en-EG', {
    style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 20,
}).format;
export function formatInventoryValue(quantity: number, unitCost: number) {
    if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return 'غير متاح';
    const value = new Exact(quantity).times(unitCost).toNumber();
    return Number.isFinite(value) ? formatInventoryCost(value) : 'غير متاح';
}
