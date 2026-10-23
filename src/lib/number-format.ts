import Decimal from 'decimal.js-light';

type DisplayValue = number | string | null | undefined;
export type NumberFieldKind = 'amount' | 'unitCost' | 'quantity' | 'percent';
export interface NumberFieldConstraints { min?: number | string; max?: number | string; step?: number | string; defaultValue?: number | string }
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
export function numberFieldKind(name = ''): NumberFieldKind {
    if (/percent|margin|rate/i.test(name)) return 'percent';
    if (/cost|price/i.test(name)) return 'unitCost';
    if (/amount|balance|discount|tax|shipping/i.test(name)) return 'amount';
    return 'quantity';
}

export function formatNumberInput(value: DisplayValue, kind: NumberFieldKind = 'quantity') {
    const parsed = decimal(value);
    if (!parsed) return '';
    const places = kind === 'quantity' ? 3 : 2;
    const small = parsed.abs().gt(0) && parsed.abs().lt(new DisplayDecimal(10).pow(-places));
    const digits = small ? 6 : places;
    // HTML number fields accept exponent notation for exceptionally small values.
    if (small && parsed.abs().lt('0.000001')) return parsed.toSignificantDigits(2).toString();
    const rounded = parsed.toDecimalPlaces(digits, DisplayDecimal.ROUND_HALF_UP);
    return !small && (kind === 'amount' || kind === 'unitCost') ? rounded.toFixed(2) : rounded.toFixed();
}

export function validateNumberInput(value: DisplayValue, constraints: NumberFieldConstraints): true | string {
    if (value === '' || value === null || value === undefined) return true;
    const parsed = decimal(value);
    if (!parsed) return 'أدخل رقمًا صالحًا.';
    const minimum = decimal(constraints.min), maximum = decimal(constraints.max);
    if (minimum && parsed.lt(minimum)) return `القيمة يجب ألا تقل عن ${constraints.min}.`;
    if (maximum && parsed.gt(maximum)) return `القيمة يجب ألا تتجاوز ${constraints.max}.`;
    if (constraints.step === 'any') return true;
    const providedStep = decimal(constraints.step);
    const step = providedStep?.gt(0) ? providedStep : new DisplayDecimal(1);
    const base = minimum ?? decimal(constraints.defaultValue) ?? new DisplayDecimal(0);
    const steps = parsed.minus(base).dividedBy(step);
    const distance = steps.minus(steps.toDecimalPlaces(0, DisplayDecimal.ROUND_HALF_UP)).abs();
    // Accept floating point noise such as 0.1 + 0.2, while checking the raw value.
    return distance.lte('0.0000001') || `أدخل قيمة تتوافق مع الخطوة ${step.toFixed()}.`;
}
export function formatCurrency(value: DisplayValue) {
    const text = formatAmount(value);
    return text === unavailable ? text : `${text} ج.م`;
}
export function formatUnitCostCurrency(value: DisplayValue) {
    const text = formatUnitCost(value);
    return text === unavailable ? text : `${text} ج.م`;
}
