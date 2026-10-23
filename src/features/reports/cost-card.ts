import Decimal from 'decimal.js-light';
import { readCompleteRows, type FetchDataPage } from '../../platform/data/read-complete-rows.ts';
const Exact = Decimal.clone({ precision: 40 });
type Value = number | string | null;
export interface CostMaterial { id: number; name: string; unit: string; unit_cost: Value }
export interface CostSemi extends CostMaterial { recipe_batch_size: Value }
export interface CostFinished extends CostMaterial { code: string; quantity: number; sales_price: Value; semi_finished_id: number | null; semi_finished_quantity: Value }
export interface CostIngredient { id: number; semi_finished_id: number; raw_material_id: number; quantity: Value; percentage: Value }
export interface CostPackaging { id: number; finished_product_id: number; packaging_material_id: number; quantity: Value }
export interface CostSources { finished: CostFinished[]; semi: CostSemi[]; ingredients: CostIngredient[]; packaging: CostPackaging[]; raw: CostMaterial[]; materials: CostMaterial[] }
export type CostFetchers = { [Key in keyof CostSources]: FetchDataPage<CostSources[Key][number]> };
export interface CostLine { id: number; name: string; unit: string; quantity: string | null; unitCost: string | null; cost: string | null }
export interface ProductCostCard { product: CostFinished; semiName: string; semiQuantity: string | null; semiRecorded: string | null;
    rawRows: CostLine[]; batchSize: string | null; batchCost: string | null; rawUnitEstimate: string | null; rawForFinished: string | null;
    packagingRows: CostLine[]; packagingCost: string | null; recorded: string | null; estimate: string | null; difference: string | null;
    salesPrice: string | null; marginAmount: string | null; marginPercent: string | null; estimateMargin: string | null; warnings: string[] }
function costNumber(value: Value | undefined) {
    if (value === null || value === undefined || value === '') return null;
    try { const amount = new Exact(value); return Number.isFinite(amount.toNumber()) ? amount : null; }
    catch { return null; } // Invalid historical numeric fields are explicitly unavailable in this report.
}
function nonnegative(value: Value | undefined) { const amount = costNumber(value); return amount?.gte(0) ? amount : null; }
function total(rows: CostLine[]) { return rows.some(row => row.cost === null) ? null : rows.reduce((sum, row) => sum.plus(row.cost!), new Exact(0)); }
function costLine(source: { id: number; materialId: number; quantity: Value }, material: CostMaterial | undefined, label: string) {
    const quantity = nonnegative(source.quantity), cost = nonnegative(material?.unit_cost), warnings: string[] = [];
    if (!material) warnings.push(`${label} غير متاحة (معرّف ${source.materialId})؛ التقدير المرتبط بها غير مكتمل.`);
    else if (!quantity || !cost) warnings.push(`تعذر حساب تكلفة ${material.name}؛ راجع الكمية والتكلفة المسجلتين.`);
    const row: CostLine = { id: source.id, name: material?.name ?? `${label} غير متاحة`, unit: material?.unit ?? '', quantity: quantity?.toString() ?? null,
        unitCost: cost?.toString() ?? null, cost: material && quantity && cost ? quantity.times(cost).toString() : null };
    return { row, warnings };
}
export async function loadCostSources(fetchers: CostFetchers): Promise<CostSources> {
    const [finished, semi, ingredients, packaging, raw, materials] = await Promise.all([
        readCompleteRows(fetchers.finished, 'COST_FINISHED'), readCompleteRows(fetchers.semi, 'COST_SEMI'),
        readCompleteRows(fetchers.ingredients, 'COST_INGREDIENTS'), readCompleteRows(fetchers.packaging, 'COST_PACKAGING'),
        readCompleteRows(fetchers.raw, 'COST_RAW'), readCompleteRows(fetchers.materials, 'COST_MATERIALS')]);
    return { finished, semi, ingredients, packaging, raw, materials };
}
function group<Row>(rows: Row[], key: (row: Row) => number) {
    const groups = new Map<number, Row[]>();
    for (const row of rows) { const id = key(row), items = groups.get(id) ?? []; items.push(row); groups.set(id, items); }
    return groups;
}
function semiCosts(product: CostFinished, semis: Map<number, CostSemi>) {
    if (product.semi_finished_id === null) return { product: undefined, name: 'بدون منتج نصف مصنع', quantity: new Exact(0), recorded: new Exact(0), warnings: [] as string[] };
    const semi = semis.get(product.semi_finished_id), quantity = nonnegative(product.semi_finished_quantity), cost = nonnegative(semi?.unit_cost);
    const recorded = semi && quantity && cost ? quantity.times(cost) : null;
    const warnings = !semi ? ['المنتج نصف المصنع المرتبط غير متاح؛ تقدير التعبئة غير مكتمل.']
        : recorded === null ? ['تعذر حساب مكوّن نصف المصنع؛ راجع كميته وتكلفته المسجلتين.'] : [];
    return { product: semi, name: semi?.name ?? 'نصف مصنع غير متاح', quantity, recorded, warnings };
}
function rawCosts(semi: CostSemi | undefined, ingredients: CostIngredient[], materials: Map<number, CostMaterial>) {
    if (!semi) return { rows: [] as CostLine[], batch: null, batchCost: null, unit: null, warnings: [] as string[] };
    const size = nonnegative(semi.recipe_batch_size), batch = size?.gt(0) ? size : null;
    const warnings = batch ? [] : ['حجم التشغيلة غير محدد؛ يستخدم الخادم 100 عند الإنتاج و1 عند إعادة حساب التكلفة. تقدير خامات الوصفة غير متاح.'];
    const lines = ingredients.map(source => costLine({ ...source, materialId: source.raw_material_id }, materials.get(source.raw_material_id), 'مادة خام'));
    if (ingredients.some(source => costNumber(source.quantity)?.eq(0) && costNumber(source.percentage)?.gt(0)))
        warnings.push('كمية صفر في وصفة قديمة ذات نسبة؛ الإنتاج يحتسب الكمية صفرًا. يعرض المحرر كمية مشتقة من النسبة عند مراجعتها وحفظها.');
    if (lines.length === 0) warnings.push('لا توجد مكونات خام مسجلة لوصفة نصف المصنع.');
    const rows = lines.map(line => line.row), batchCost = total(rows);
    return { rows, batch, batchCost, unit: batchCost && batch ? batchCost.div(batch) : null, warnings: [...warnings, ...lines.flatMap(line => line.warnings)] };
}
function cardTotals(product: CostFinished, estimate: Decimal | null) {
    const recorded = costNumber(product.unit_cost), salesPrice = nonnegative(product.sales_price), margin = recorded && salesPrice ? salesPrice.minus(recorded) : null;
    const warnings = recorded === null ? ['التكلفة المسجلة للمنتج غير متاحة؛ لم تُستبدل بتقدير الوصفة.']
        : recorded.eq(0) ? ['التكلفة المسجلة صفر؛ الهامش المعروض محسوب عليها، وليس على تقدير الوصفة.']
            : recorded.lt(0) ? ['التكلفة المسجلة سالبة؛ راجع بيانات المنتج قبل الاعتماد على الهامش.'] : [];
    return { recorded: recorded?.toString() ?? null, salesPrice: salesPrice?.toString() ?? null,
        difference: recorded && estimate ? estimate.minus(recorded).toString() : null, marginAmount: margin?.toString() ?? null,
        marginPercent: margin && salesPrice?.gt(0) ? margin.div(salesPrice).times(100).toString() : null,
        estimateMargin: estimate && salesPrice?.gt(0) ? salesPrice.minus(estimate).div(salesPrice).times(100).toString() : null, warnings };
}
interface CostLookups { semis: Map<number, CostSemi>; raw: Map<number, CostMaterial>; materials: Map<number, CostMaterial>; ingredients: Map<number, CostIngredient[]>; packaging: Map<number, CostPackaging[]> }
function buildCard(product: CostFinished, lookups: CostLookups): ProductCostCard {
    const semi = semiCosts(product, lookups.semis), raw = rawCosts(semi.product, lookups.ingredients.get(product.semi_finished_id!) ?? [], lookups.raw);
    const packaging = (lookups.packaging.get(product.id) ?? []).map(source => costLine({ ...source, materialId: source.packaging_material_id }, lookups.materials.get(source.packaging_material_id), 'مادة تعبئة'));
    const packagingRows = packaging.map(line => line.row), packagingCost = total(packagingRows);
    const estimate = semi.recorded && packagingCost ? semi.recorded.plus(packagingCost) : null, totals = cardTotals(product, estimate);
    return { product, semiName: semi.name, semiQuantity: semi.quantity?.toString() ?? null, semiRecorded: semi.recorded?.toString() ?? null,
        rawRows: raw.rows, batchSize: raw.batch?.toString() ?? null, batchCost: raw.batchCost?.toString() ?? null,
        rawUnitEstimate: raw.unit?.toString() ?? null, rawForFinished: raw.unit && semi.quantity ? raw.unit.times(semi.quantity).toString() : null,
        packagingRows, packagingCost: packagingCost?.toString() ?? null, estimate: estimate?.toString() ?? null, ...totals,
        warnings: [...new Set([...semi.warnings, ...raw.warnings, ...packaging.flatMap(line => line.warnings), ...totals.warnings])] };
}
export function buildCostCards(sources: CostSources): ProductCostCard[] {
    const lookups: CostLookups = { semis: new Map(sources.semi.map(row => [row.id, row])), raw: new Map(sources.raw.map(row => [row.id, row])),
        materials: new Map(sources.materials.map(row => [row.id, row])), ingredients: group(sources.ingredients, row => row.semi_finished_id), packaging: group(sources.packaging, row => row.finished_product_id) };
    return sources.finished.map(product => buildCard(product, lookups)).sort((a, b) => a.product.name.localeCompare(b.product.name, 'ar') || a.product.id - b.product.id);
}
