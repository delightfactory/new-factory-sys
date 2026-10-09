import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Payload = Record<string, unknown>;
const pending = new Map<string, string>();
function commandMessage(message: string): string {
    if (message.includes("MCP_TREASURY_INSUFFICIENT")) return "رصيد الخزينة لا يكفي. راجع المبلغ ثم أعد المحاولة؛ لم تُسجل العملية.";
    if (message.includes("MCP_STOCK_INSUFFICIENT")) return "المخزون لا يكفي لإكمال العملية. راجع الكميات المتاحة؛ لم تُسجل العملية.";
    if (message.includes("MCP_ACCESS_FORBIDDEN") || message.includes("MCP_ACTION_FORBIDDEN")) return "صلاحيات حسابك لا تسمح بهذه العملية. راجع مدير النظام.";
    if (message.includes("MCP_FINANCIAL_REVERSAL_REVIEW_REQUIRED")) return "هذه الحركة مرتبطة بفاتورة أو طرف أو تحويل. راجع العملية الأصلية قبل إلغائها؛ لم يُحذف القيد.";
    if (message.includes("MCP_FINANCIAL_ALREADY_REVERSED")) return "الحركة عُكست ضمن عملية سابقة. راجع العملية الأصلية؛ لم يتغير أي رصيد.";
    if (message.includes("MCP_TRANSFER_PAIR_REQUIRED")) return "اختر الحركة المقابلة للتحويل لإلغاء الطرفين معًا. لم يتغير أي رصيد.";
    if (message.includes("MCP_INVOICE_LINK_INVALID") || message.includes("MCP_SETTLEMENT_AMOUNT_INVALID")) return "تغيرت حالة الفاتورة أو تسويتها. حدّث بياناتها وراجع الحركة قبل الإلغاء؛ لم يتغير أي رصيد.";
    if (message.includes("MCP_TRANSITION_INVALID")) return "تغيرت حالة العملية. حدّث القائمة وراجع حالتها قبل المحاولة مرة أخرى.";
    if (message.includes("MCP_INPUT_INVALID") || message.includes("MCP_TOTAL_INVALID")) return "راجع بيانات العملية والكميات والمبالغ. بيانات النموذج محفوظة.";
    if (message.includes("MCP_REQUEST_CONFLICT")) return "تغيرت بيانات طلب سابق. حدّث الصفحة وراجع العملية قبل إنشاء طلب جديد.";
    if (/factory_(native_)?write/.test(message) && /not find|does not exist|schema cache/i.test(message)) return "تحديث قاعدة البيانات غير مكتمل. راجع مدير النظام قبل إعادة المحاولة.";
    return "تعذر تأكيد نتيجة العملية. أعد المحاولة بنفس البيانات؛ سيُستخدم الطلب نفسه لمنع التكرار.";
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
    }
    return value;
}

export function fields(source: object, names: string[]): Payload {
    return Object.fromEntries(Object.entries(source).filter(([key, value]) => names.includes(key) && value !== undefined));
}

export function commercialItems(items: object[]) {
    const links: Record<string, string> = { raw_material: "raw_material_id", packaging_material: "packaging_material_id",
        semi_finished: "semi_finished_product_id", finished_product: "finished_product_id", bundle: "bundle_id" };
    return items.map(item => {
        const line = item as Payload;
        return { item_type: line.item_type, item_id: line[links[String(line.item_type)]],
            quantity: line.quantity, unit_price: line.unit_price };
    });
}

// The request UUID survives an uncertain response and a page reload. Only the
// user/action/payload hash and UUID are stored; no business payload or token.
export async function factoryCommand<T = Payload>(action: string, payload: Payload, requestId?: string): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("سجّل الدخول لإتمام العملية.");
    const data = canonical(payload) as Payload;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
    const intent = `factory-intent:${session.user.id}:${action}:${hash}`;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(intent); } catch { /* Memory remains usable if storage is disabled. */ }
    const key = requestId ?? pending.get(intent) ?? saved ?? crypto.randomUUID();
    pending.set(intent, key);
    try { sessionStorage.setItem(intent, key); } catch { /* See above. */ }
    const { data: result, error } = await supabase.rpc("factory_native_write", {
        p_action: action, p_payload: data, p_request_id: key,
    });
    if (error || !result?.record) {
        const failure = new Error(commandMessage(error?.message ?? ""));
        Object.assign(failure, { requestId: key });
        throw failure;
    }
    pending.delete(intent);
    try { if (sessionStorage.getItem(intent) === key) sessionStorage.removeItem(intent); } catch { /* Optional storage. */ }
    if (result.record.legacy_valuation) toast.info("تم الإلغاء وفق قواعد النظام الأصلية؛ بقيت تكلفة المخزون المسجلة كما هي.");
    if (Array.isArray(result.record.negative_stock) && result.record.negative_stock.length) {
        toast.warning("اكتمل الأمر مع أرصدة مخزون سالبة.", {
            description: result.record.negative_stock.map((item: { name: string; quantity: number; unit: string }) =>
                `${item.name}: ${item.quantity.toLocaleString()} ${item.unit}`).join("، "),
            duration: 10000,
        });
    }
    return (result.record.record ?? result.record) as T;
}

export async function commercialCommand<T>(kind: "sales" | "purchase", document: "invoice" | "return", header: object, items: object[]): Promise<T> {
    const data = header as Payload;
    const payload = fields(header, [kind === "sales" ? "customer_id" : "supplier_id", "notes", "original_invoice_id",
        "treasury_id", "paid_amount", "tax_amount", "shipping_cost", "discount_amount", "invoice_number"]);
    const optional = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null));
    return factoryCommand<T>(`create_${kind}_${document}`, { ...optional,
        date: data.transaction_date ?? data.return_date, items: commercialItems(items) });
}

export async function inventoryCommand<T>(kind: string, source: object, id?: number, recipe?: Payload): Promise<T> {
    const payload = fields(source, ["code", "name", "unit", "quantity", "min_stock", "unit_cost", "sales_price", "importance",
        "recipe_batch_size", "semi_finished_id", "semi_finished_quantity"]);
    if (id === undefined) return factoryCommand<T>(`create_${kind}`, { ...payload, ...recipe });
    // One server transaction edits metadata/recipe and any explicit stock adjustment.
    return factoryCommand<T>(`edit_${kind}`, { ...payload, ...recipe, id });
}
