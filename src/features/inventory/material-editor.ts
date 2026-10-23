export type MaterialKind = 'raw' | 'packaging';
export interface MaterialValues {
    code: string; name: string; unit: string; quantity: number;
    min_stock: number; unit_cost: number; sales_price: number;
}
export interface MaterialSnapshot { values: MaterialValues; changed: string[]; originalCost: number }
export const materialLabels = {
    raw: { title: 'مادة خام', query: 'rawMaterials', table: 'raw_materials', prefix: 'RM' },
    packaging: { title: 'مادة تعبئة', query: 'packagingMaterials', table: 'packaging_materials', prefix: 'PM' },
} as const;
export function emptyMaterial(): MaterialValues {
    return { code: '', name: '', unit: '', quantity: 0, min_stock: 0, unit_cost: 0, sales_price: 0 };
}
export function materialValues(row: MaterialValues): MaterialValues {
    return { code: row.code, name: row.name, unit: row.unit, quantity: Number(row.quantity),
        min_stock: Number(row.min_stock ?? 0), unit_cost: Number(row.unit_cost), sales_price: Number(row.sales_price ?? 0) };
}
export function changedMaterialFields(values: MaterialValues, original: MaterialValues): string[] {
    const fields: (keyof MaterialValues)[] = ['code', 'name', 'unit', 'quantity', 'min_stock', 'unit_cost', 'sales_price'];
    return fields.filter(field => !Object.is(values[field], original[field]));
}
// A metadata edit cannot reset live stock or silently revalue it from an old form.
export function materialPatch(snapshot: MaterialSnapshot, explicitCost: boolean): Partial<MaterialValues> {
    const { values, changed } = snapshot;
    const patch: Partial<MaterialValues> = {};
    if (changed.includes('name')) patch.name = values.name;
    if (changed.includes('unit')) patch.unit = values.unit;
    if (changed.includes('min_stock')) patch.min_stock = values.min_stock;
    if (changed.includes('sales_price')) patch.sales_price = values.sales_price;
    if (explicitCost && changed.includes('unit_cost')) patch.unit_cost = values.unit_cost;
    return patch;
}
export function codeSuggestionCurrent(opening: number, currentOpening: number, request: number, currentRequest: number, original: string, current: string): boolean {
    return opening === currentOpening && request === currentRequest && original === current;
}
export const finiteMaterialNumber = (value: number) => Number.isFinite(value) || 'أدخل رقمًا صالحًا؛ لا تترك الحقل فارغًا.';
export function referencePlaceholder(value: string | undefined, rows: readonly { id: number }[] | undefined, emptyLabel: string): string {
    if (!value) return emptyLabel;
    if (!rows) return 'اختيار محفوظ؛ الاسم غير متاح';
    return rows.some(row => String(row.id) === value) ? emptyLabel : 'اختيار محفوظ غير موجود في القائمة';
}
