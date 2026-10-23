import { isDefinitiveCommandFailure } from '../../platform/data/command-failure.ts';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;
export type CoverageStage = 'create_ready' | 'create_sent' | 'created' | 'production_sent' | 'produced' | 'packaging_sent' | 'completed' | 'cancelled';
export type PackagingAction = 'complete_packaging_order' | 'complete_packaging_order_allow_shortage';
export interface CoverageAttempt {
    version: 1;
    actor: string;
    packagingOrderId: number;
    mode: 'production' | 'packaging-only';
    stage: CoverageStage;
    payload: { date: string; notes: string; items: { semi_finished_id: number; quantity: number }[] };
    requests: { create: string; production: string; packaging: string };
    packagingAction: PackagingAction;
    order?: { id: number; code: string };
    observedElsewhere?: boolean;
    stoppedReason?: string;
    productionSkipped?: boolean;
    packagingAttempted?: boolean;
    packagingHistory?: { requestId: string; action: PackagingAction }[];
}
interface StoreContext { storage: StoragePort; actor: string; packagingOrderId: number }
interface OrderState { id: number; code: string; status: string }
interface AdvanceOptions extends StoreContext {
    send: (action: string, payload: Record<string, unknown>, requestId: string) => Promise<unknown>;
    readOrder: (kind: 'production' | 'packaging', id: number) => Promise<OrderState>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stages: CoverageStage[] = ['create_ready', 'create_sent', 'created', 'production_sent', 'produced', 'packaging_sent', 'completed', 'cancelled'];
const prefix = (actor: string) => `factory-coverage:v1:${actor}:`;
const key = (context: StoreContext) => prefix(context.actor) + context.packagingOrderId;
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const coverageUncertain = (attempt: CoverageAttempt | null) => !!attempt && ['create_sent', 'production_sent', 'packaging_sent'].includes(attempt.stage);

function validate(value: unknown, context: Omit<StoreContext, 'storage'>): CoverageAttempt {
    if (!value || typeof value !== 'object') throw Error('سجل التغطية غير صالح. لا تُنشئ محاولة بديلة قبل مراجعة الأمر.');
    const item = value as CoverageAttempt;
    const orderRequired = ['created', 'production_sent', 'produced', 'packaging_sent'].includes(item.stage) && item.mode === 'production';
    if (item.version !== 1 || item.actor !== context.actor || !UUID.test(item.actor) || !validId(item.packagingOrderId) ||
        item.packagingOrderId !== context.packagingOrderId || !stages.includes(item.stage) || !['production', 'packaging-only'].includes(item.mode) ||
        !item.requests || !Object.values(item.requests).every(request => typeof request === 'string' && UUID.test(request)) ||
        !UUID.test(item.requests.create ?? '') || !UUID.test(item.requests.production ?? '') || !UUID.test(item.requests.packaging ?? '') ||
        new Set(Object.values(item.requests)).size !== 3 || !['complete_packaging_order', 'complete_packaging_order_allow_shortage'].includes(item.packagingAction) ||
        !item.payload || !/^\d{4}-\d{2}-\d{2}$/.test(item.payload.date) || !Number.isFinite(Date.parse(item.payload.date)) ||
        new Date(item.payload.date).toISOString().slice(0, 10) !== item.payload.date ||
        typeof item.payload.notes !== 'string' || item.payload.notes.length > 2000 || !Array.isArray(item.payload.items) ||
        item.payload.items.length > 100 || (item.mode === 'production' && item.payload.items.length === 0) ||
        item.payload.items.some(row => !validId(row.semi_finished_id) || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1e9) ||
        [item.observedElsewhere, item.productionSkipped, item.packagingAttempted].some(flag => flag !== undefined && typeof flag !== 'boolean') ||
        (item.stoppedReason !== undefined && (typeof item.stoppedReason !== 'string' || item.stoppedReason.length > 2000)) ||
        (item.packagingHistory !== undefined && (!Array.isArray(item.packagingHistory) || item.packagingHistory.some(previous =>
            !UUID.test(previous.requestId) || !['complete_packaging_order', 'complete_packaging_order_allow_shortage'].includes(previous.action)))) ||
        (orderRequired && !item.order) || (item.order && (!validId(item.order.id) || typeof item.order.code !== 'string' || !item.order.code.length)) ||
        (item.mode === 'packaging-only' && !['produced', 'packaging_sent', 'completed', 'cancelled'].includes(item.stage))) {
        throw Error('سجل التغطية غير صالح. احتفظ ببيانات التبويب وراجع الأمر قبل المتابعة.');
    }
    return item;
}

export function readCoverage(context: StoreContext): CoverageAttempt | null {
    const raw = context.storage.getItem(key(context));
    if (!raw) return null;
    try { return validate(JSON.parse(raw), context); }
    catch { throw Error('تعذر قراءة سجل التغطية. لا تمسح بيانات التبويب؛ راجع العملية قبل إنشاء أمر جديد.'); }
}
export function listCoverage(storage: StoragePort, actor: string): CoverageAttempt[] {
    const found: CoverageAttempt[] = [];
    for (let index = 0; index < storage.length; index++) {
        const entry = storage.key(index);
        if (!entry?.startsWith(prefix(actor)) || entry.includes(':archive:')) continue;
        const id = Number(entry.slice(prefix(actor).length));
        if (!validId(id)) throw Error('تعذر قراءة رقم أمر في سجل التغطية.');
        const attempt = readCoverage({ storage, actor, packagingOrderId: id });
        if (attempt) found.push(attempt);
    }
    return found;
}
function persist(context: StoreContext, attempt: CoverageAttempt, expectedStage?: CoverageStage) {
    validate(attempt, context);
    if (expectedStage) {
        const current = readCoverage(context);
        if (!current || current.requests.create !== attempt.requests.create || current.stage !== expectedStage) {
            throw Error('تغيرت مرحلة التغطية. افتح العملية المحفوظة لمتابعتها.');
        }
    }
    context.storage.setItem(key(context), JSON.stringify(attempt));
}

export function startCoverage(options: StoreContext & {
    payload: CoverageAttempt['payload']; mode: CoverageAttempt['mode']; packagingAction: PackagingAction;
}): CoverageAttempt {
    if (readCoverage(options)) throw Error('توجد محاولة محفوظة لهذا الأمر؛ استكملها أولًا.');
    const attempt: CoverageAttempt = { version: 1, actor: options.actor, packagingOrderId: options.packagingOrderId,
        mode: options.mode, stage: options.mode === 'production' ? 'create_ready' : 'produced',
        payload: structuredClone(options.payload), packagingAction: options.packagingAction,
        requests: { create: crypto.randomUUID(), production: crypto.randomUUID(), packaging: crypto.randomUUID() } };
    persist(options, attempt);
    return attempt;
}

// Archiving is explicit and only allowed after production has finished, the
// attempt stopped, or a rejected create is ready. Server documents remain intact.
export function archiveCoverage(context: StoreContext) {
    const attempt = readCoverage(context);
    if (!attempt || !['create_ready', 'produced', 'completed', 'cancelled'].includes(attempt.stage)) {
        throw Error('أكّد نتيجة الخطوة أو نفّذ/ألغِ أمر الإنتاج قبل بدء تغطية إضافية.');
    }
    context.storage.setItem(key(context) + ':archive:' + attempt.requests.create, JSON.stringify(attempt));
    // Keep an explicit tombstone rather than deleting an operation journal.
    context.storage.setItem(key(context), '');
}

export function chooseCoveragePackaging(context: StoreContext & { action: PackagingAction }) {
    const attempt = readCoverage(context);
    if (!attempt || !['create_ready', 'created', 'produced'].includes(attempt.stage)) {
        throw Error('أكّد نتيجة خطوة التغطية الحالية قبل تغيير طريقة تنفيذ التعبئة.');
    }
    const previous = attempt.stage;
    if (attempt.packagingAttempted && attempt.packagingAction !== context.action) {
        // Reaching this stage after a send means an explicit rollback was
        // received. A different action is a new intent, never a replay.
        attempt.packagingHistory = [...(attempt.packagingHistory ?? []), { requestId: attempt.requests.packaging, action: attempt.packagingAction }];
        attempt.requests.packaging = crypto.randomUUID(); attempt.packagingAttempted = false;
    }
    if (attempt.stage !== 'produced') { attempt.mode = 'packaging-only'; attempt.productionSkipped = true; }
    attempt.packagingAction = context.action; attempt.stage = 'produced';
    persist(context, attempt, previous);
    return attempt;
}

function checkedStatus(order: OrderState, expectedId: number) {
    if (order.id !== expectedId || !['pending', 'inProgress', 'completed', 'cancelled'].includes(order.status)) {
        throw Error('حالة الأمر غير معروفة. حدّث بياناته قبل المتابعة.');
    }
    return order.status;
}

export async function advanceCoverage(options: AdvanceOptions): Promise<CoverageAttempt> {
    const original = readCoverage(options);
    if (!original) throw Error('لا توجد محاولة تغطية محفوظة.');
    const attempt = structuredClone(original);
    if (['completed', 'cancelled'].includes(attempt.stage)) return attempt;
    // An uncertain write is always replayed before consulting newer reads.
    if (!coverageUncertain(attempt)) {
        const packaging = checkedStatus(await options.readOrder('packaging', attempt.packagingOrderId), attempt.packagingOrderId);
        if (packaging === 'cancelled' || packaging === 'completed') {
            attempt.stage = packaging === 'completed' && attempt.stage === 'produced' ? 'completed' : 'cancelled';
            attempt.observedElsewhere = true;
            attempt.stoppedReason = (packaging === 'completed' ? 'أمر التعبئة مكتمل بالفعل.' : 'أمر التعبئة أُلغي خارج هذه العملية.') +
                (attempt.order ? ` راجع أيضًا أمر الإنتاج المحفوظ ${attempt.order.code} قبل أي تنفيذ جديد.` : '');
            persist(options, attempt, original.stage); return attempt;
        }
        if (attempt.stage === 'created') {
            const status = checkedStatus(await options.readOrder('production', attempt.order!.id), attempt.order!.id);
            if (status === 'completed' || status === 'cancelled') {
                attempt.stage = status === 'completed' ? 'produced' : 'cancelled';
                attempt.observedElsewhere = true;
                attempt.stoppedReason = status === 'cancelled' ? 'أمر الإنتاج أُلغي خارج هذه العملية.' : undefined;
                persist(options, attempt, original.stage); return attempt;
            }
        }
    }
    const phase = attempt.stage === 'create_ready' || attempt.stage === 'create_sent' ? 'create' :
        attempt.stage === 'created' || attempt.stage === 'production_sent' ? 'production' : 'packaging';
    const sent: CoverageStage = phase === 'create' ? 'create_sent' : phase === 'production' ? 'production_sent' : 'packaging_sent';
    const retryable: CoverageStage = phase === 'create' ? 'create_ready' : phase === 'production' ? 'created' : 'produced';
    attempt.stage = sent;
    if (phase === 'packaging') attempt.packagingAttempted = true;
    persist(options, attempt, original.stage);
    let result: unknown;
    try {
        result = await options.send(phase === 'create' ? 'create_production_order' : phase === 'production' ? 'complete_production_order' : attempt.packagingAction,
            phase === 'create' ? attempt.payload : { id: phase === 'production' ? attempt.order!.id : attempt.packagingOrderId }, attempt.requests[phase]);
    } catch (error) {
        if (isDefinitiveCommandFailure(error, coverageUncertain(original))) {
            attempt.stage = retryable;
            persist(options, attempt, sent);
        }
        throw error;
    }
    if (phase === 'create') {
        const order = result as { id?: unknown; code?: unknown } | null;
        if (!order || !validId(order.id) || typeof order.code !== 'string' || !order.code) {
            throw Error('تعذر تأكيد رقم أمر الإنتاج. أعد تأكيد النتيجة بنفس الطلب.');
        }
        attempt.order = { id: order.id, code: order.code }; attempt.stage = 'created';
    } else attempt.stage = phase === 'production' ? 'produced' : 'completed';
    persist(options, attempt, sent);
    return attempt;
}
