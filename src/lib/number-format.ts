import Decimal from 'decimal.js-light';

type DisplayValue = number | string | null | undefined;
const DisplayDecimal = Decimal.clone({ precision: 40 });
const unavailable = 'غير متاح';

function decimal(value: DisplayValue) {
    if (value === null || value === undefined || value === '' ||
        (typeof value === 'number' && !Number.isFinite(value))) return null;
    try { return new DisplayDecimal(value); } catch { return null; }
}

// Presentation only: never feed grouped/rounded text back into an editor or calculation.
function display(value: DisplayValue, places: number, fixed = false, smallPlaces = places) {
    const parsed = decimal(value);
    if (!parsed) return unavailable;
    const absolute = parsed.abs();
    const digits = absolute.gt(0) && absolute.lt(new DisplayDecimal(10).pow(-places)) ? smallPlaces : places;
    const smallest = new DisplayDecimal(10).pow(-digits);
    if (absolute.gt(0) && absolute.lt(smallest)) {
        return parsed.isNegative() ? `بين -${smallest.toFixed(digits)} و0` : `أقل من ${smallest.toFixed(digits)}`;
    }
    const rounded = parsed.toDecimalPlaces(digits, DisplayDecimal.ROUND_HALF_UP);
    const text = fixed && digits === places ? rounded.toFixed(digits) : rounded.toFixed();
    const [whole, fraction] = text.split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
}

export const formatAmount = (value: DisplayValue) => display(value, 2, true);
export const formatQuantity = (value: DisplayValue) => display(value, 3, false, 6);
export const formatUnitCost = (value: DisplayValue) => display(value, 2, true, 6);
export const formatPercentage = (value: DisplayValue) => display(value, 2);
export function formatCurrency(value: DisplayValue) {
    const text = formatAmount(value);
    return text === unavailable ? text : `${text} ج.م`;
}
export function formatUnitCostCurrency(value: DisplayValue) {
    const text = formatUnitCost(value);
    return text === unavailable ? text : `${text} ج.م`;
}
