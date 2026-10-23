import { FormNumberInput } from '@/components/ui/number-input';
import {invoiceAmounts,formatInvoiceAmount} from '@/platform/finance/invoice-amounts';
import { useEffect } from 'react';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDocumentExitGuard } from '@/hooks/use-document-exit-guard';
import { supabase } from '@/integrations/supabase/client';
import { factoryCommand, commercialItems } from '@/services/FactoryCommandsService';
import { DocumentEditingService, type EditableDocument } from '@/services/DocumentEditingService';
import { readCompleteRows } from '@/platform/data/read-complete-rows';
import { factoryBusinessDay } from '@/platform/date/factory-business-day';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type ItemType = 'raw_material' | 'packaging_material' | 'semi_finished' | 'finished_product' | 'bundle';
interface InvoiceValues {
    party_id: string; treasury_id: string; date: string; invoice_number: string; notes: string;
    tax_amount: number; shipping_cost: number; discount_amount: number; paid_amount: number;
    items: { item_type: ItemType; item_id: string; quantity: number; unit_price: number }[];
}
interface Lookup { id: number | string; name: string; type?: string; sales_price?: number; unit_cost?: number; bundle_price?: number; is_active?: boolean }
const itemTypes: [ItemType, string, string][] = [
    ['finished_product', 'منتج تام', 'finished_products'], ['semi_finished', 'منتج نصف مصنع', 'semi_finished_products'],
    ['raw_material', 'مادة خام', 'raw_materials'], ['packaging_material', 'مادة تعبئة', 'packaging_materials'], ['bundle', 'باقة', 'product_bundles'],
];
async function lookup(table: string): Promise<Lookup[]> {
    return readCompleteRows(async (from, to) => {
        const result = await supabase.from(table).select('*', { count: 'exact' }).order('id').range(from, to);
        return { rows: result.data as Lookup[] | null, count: result.count, error: result.error };
    }, `INVOICE_${table.toUpperCase()}`);
}
function defaults(sale: boolean, document?: EditableDocument): InvoiceValues {
    const h = document?.header;
    const lines = document ? commercialItems(document.items).map(item => ({ item_type: item.item_type as ItemType,
        item_id: String(item.item_id), quantity: Number(item.quantity), unit_price: Number(item.unit_price) })) :
        [{ item_type: 'finished_product' as const, item_id: '', quantity: 1, unit_price: 0 }];
    return { party_id: (sale ? h?.customer_id : h?.supplier_id) ?? '', treasury_id: h?.treasury_id ? String(h.treasury_id) : '',
        date: h?.transaction_date ?? factoryBusinessDay(), invoice_number: h?.invoice_number ?? '', notes: h?.notes ?? '',
        tax_amount: h?.tax_amount ?? 0, shipping_cost: h?.shipping_cost ?? 0, discount_amount: h?.discount_amount ?? 0,
        paid_amount: h?.paid_amount ?? 0, items: lines };
}
export default function InvoiceForm({ sale, document, onSuccess, onReload, onGuardChange }: {
    sale: boolean; document?: EditableDocument; onSuccess: (id: number) => void; onReload?: () => void;
    onGuardChange?: (state: {dirty: boolean; pending: boolean}) => void;
}) {
    const form = useForm<InvoiceValues>({ defaultValues: defaults(sale, document) });
    const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
    useWatch({control:form.control});
    const values = form.getValues();
    const client = useQueryClient();
    const options = useQuery({ queryKey: ['invoice-editor-options', sale], queryFn: async () => {
        const tables = itemTypes.filter(([type]) => sale || type !== 'bundle');
        const [parties, treasuries, ...products] = await Promise.all([lookup('parties'), lookup('treasuries'), ...tables.map(([, , table]) => lookup(table))]);
        return { parties: parties.filter(p => p.type === (sale ? 'customer' : 'supplier')), treasuries,
            products: Object.fromEntries(tables.map(([type], index) => [type, products[index]])) as Record<ItemType, Lookup[]> };
    }, refetchOnWindowFocus: false });
    const amounts=invoiceAmounts(values.items,values);
    const save = useMutation({ mutationFn: async (data: InvoiceValues) => {
        const submittedAmounts = invoiceAmounts(data.items, data);
        if (!data.party_id || data.items.length === 0 || submittedAmounts.total.isNegative() || submittedAmounts.exceedsTotal(data.paid_amount) || (data.paid_amount > 0 && !data.treasury_id))
            throw new Error('اختر الطرف، وأضف الأصناف، وراجع الإجمالي والمدفوع والخزنة.');
        const payload = { [sale ? 'customer_id' : 'supplier_id']: data.party_id, date: data.date, notes: data.notes,
            treasury_id: data.treasury_id ? Number(data.treasury_id) : null,
            tax_amount: Number(data.tax_amount), shipping_cost: Number(data.shipping_cost), discount_amount: Number(data.discount_amount),
            paid_amount: Number(data.paid_amount), items: data.items.map(item => ({ ...item, item_id: Number(item.item_id), quantity: Number(item.quantity), unit_price: Number(item.unit_price) })) };
        if (document) return DocumentEditingService.save(sale ? 'sales_invoice' : 'purchase_invoice', document, payload).then(result => result.header.id);
        const result = await factoryCommand<{ id: number }>(`create_${sale ? 'sales' : 'purchase'}_invoice`, {
            ...payload, ...(data.invoice_number.trim() ? { invoice_number: data.invoice_number.trim() } : {}),
        });
        return result.id;
    }, onSuccess: async id => {
        exitGuard.permitExit();
        form.reset(form.getValues());
        await client.invalidateQueries();
        toast.success(document ? 'تم حفظ تعديلات الفاتورة' : 'تم حفظ الفاتورة كمسودة');
        onSuccess(id);
    } });
    const dirty = form.formState.isDirty && !save.isSuccess;
    useEffect(() => { onGuardChange?.({dirty, pending: save.isPending}); }, [dirty, save.isPending, onGuardChange]);
    const exitGuard = useDocumentExitGuard(dirty, save.isPending);
    const selectOptions = (rows: Lookup[] | undefined, value: string) => {
        const list = (rows ?? []).map(row => ({ value: String(row.id), label: row.name }));
        if (value && !list.some(row => row.value === value)) list.push({ value, label: `القيمة المحفوظة #${value}` });
        return list;
    };
    const submit = (data: InvoiceValues) => {
        const total = invoiceAmounts(data.items, data);
        if (total.total.isNegative()) {
            form.setError('discount_amount', {message:'الخصم أكبر من إجمالي الفاتورة.'}, {shouldFocus:true});
            return;
        }
        if (total.exceedsTotal(data.paid_amount)) {
            form.setError('paid_amount', {message:'المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.'}, {shouldFocus:true});
            return;
        }
        if (data.paid_amount > 0 && !data.treasury_id) {
            form.setError('treasury_id', {message:'اختر خزنة لتسجيل الدفعة عند الاعتماد.'}, {shouldFocus:true});
            return;
        }
        save.mutate(data);
    };
    return <Card><CardHeader><CardTitle>{document ? `تعديل الفاتورة ${document.header.invoice_number ?? document.header.id}` : 'بيانات الفاتورة'}</CardTitle>
        {document && <p className="text-sm text-muted-foreground">مسودة · آخر تحديث: {new Date(document.header.updated_at).toLocaleString('ar-EG')}</p>}
    </CardHeader><CardContent>
        {exitGuard.confirmation}
        {options.isError && <div role="alert" className="mb-4 rounded border border-destructive p-3">تعذر تحميل قوائم الاختيار. بياناتك لم تتغير. <Button type="button" variant="outline" onClick={() => void options.refetch()}>إعادة المحاولة</Button></div>}
        <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
            <fieldset disabled={save.isPending} className="space-y-6">
                <FormGrid className="grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                    <Controller name="party_id" control={form.control} rules={{required:"اختر العميل أو المورد"}} render={({field,fieldState})=><FormField label={sale ? 'العميل' : 'المورد'} required error={fieldState.error?.message}>
                        <SearchableSelect options={selectOptions(options.data?.parties, values.party_id)} value={values.party_id} disabled={!options.data}
                            onValueChange={field.onChange} triggerRef={field.ref} ariaLabel={sale?"العميل":"المورد"} invalid={!!fieldState.error} placeholder={sale ? 'اختر العميل' : 'اختر المورد'} />
                    </FormField>}/>
                    <FormField label="تاريخ الفاتورة" required><Input aria-label="تاريخ الفاتورة" type="date" {...form.register('date', { required: true })} /></FormField>
                    <FormField label={document ? 'رقم الفاتورة' : 'رقم الفاتورة (اختياري)'}><Input aria-label="رقم الفاتورة" readOnly={!!document} {...form.register('invoice_number')} placeholder="يُنشأ تلقائيًا" /></FormField>
                    <Controller name="treasury_id" control={form.control} render={({field,fieldState})=><FormField label="الخزنة" error={fieldState.error?.message}><SearchableSelect ariaLabel="الخزنة" triggerRef={field.ref} invalid={!!fieldState.error} options={[{ value: 'none', label: 'بدون دفعة' }, ...selectOptions(options.data?.treasuries, values.treasury_id)]} value={values.treasury_id || 'none'} disabled={!options.data}
                        onValueChange={value => field.onChange(value === 'none' ? '' : value)} /></FormField>}/>
                </FormGrid>
                <section aria-label="أصناف الفاتورة" className="space-y-3">
                    <h2 className="font-semibold">الأصناف <span className="text-muted-foreground">({fields.length})</span></h2>
                    {fields.map((field, index) => {
                        const item = values.items[index] ?? field;
                        return <div key={field.id} className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 lg:grid-cols-12">
                            <div className="col-span-2 lg:col-span-2"><FormField label="نوع الصنف"><select aria-label={`نوع الصنف ${index + 1}`} className="h-10 w-full rounded-md border bg-background px-2" {...form.register(`items.${index}.item_type`, { onChange: () => {
                                form.setValue(`items.${index}.item_id`, '', { shouldDirty: true });form.setValue(`items.${index}.unit_price`, 0, { shouldDirty: true });
                            } })}>{itemTypes.filter(([type]) => sale || type !== 'bundle').map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></FormField></div>
                            <div className="col-span-2 lg:col-span-4"><Controller name={`items.${index}.item_id`} control={form.control} rules={{required:"اختر الصنف",validate:value=>Number(value)>0||"اختر صنفًا صحيحًا"}} render={({field:selection,fieldState})=><FormField label={`الصنف ${index + 1}`} required error={fieldState.error?.message}><SearchableSelect triggerRef={selection.ref} ariaLabel={`الصنف ${index+1}`} invalid={!!fieldState.error}
                                options={selectOptions(options.data?.products[item.item_type]?.filter(row => row.is_active !== false || String(row.id) === item.item_id), item.item_id)} value={item.item_id} disabled={!options.data}
                                onValueChange={value => {
                                    selection.onChange(value);
                                    const row = options.data?.products[item.item_type]?.find(row => String(row.id) === value);
                                    form.setValue(`items.${index}.unit_price`, Number(sale ? row?.sales_price ?? row?.bundle_price ?? 0 : row?.unit_cost ?? 0), { shouldDirty: true });
                                }} placeholder="اختر الصنف" /></FormField>}/></div>
                            <div className="lg:col-span-2"><FormField label="الكمية" required error={form.formState.errors.items?.[index]?.quantity?.message}><FormNumberInput aria-label={`كمية البند ${index + 1}`} type="number" step="any" min="0.000001" max="1000000000" control={form.control} name={`items.${index}.quantity`} rules={{required: "أدخل قيمة", min: {value: 0.000001, message: "الكمية يجب أن تكون أكبر من صفر"}, max: {value: 1e9, message: "الكمية تتجاوز الحد المسموح"}}} /></FormField></div>
                            <div className="lg:col-span-2"><FormField label="سعر الوحدة" required error={form.formState.errors.items?.[index]?.unit_price?.message}><FormNumberInput aria-label={`سعر البند ${index + 1}`} type="number" step="any" min="0" max="1000000000000" control={form.control} name={`items.${index}.unit_price`} rules={{required: "أدخل قيمة", min: {value: 0, message: "القيمة لا يمكن أن تكون سالبة"}, max: {value: 1e12, message: "القيمة تتجاوز الحد المسموح"}}} /></FormField></div>
                            <div className="col-span-2 flex items-center justify-between lg:col-span-2"><output>{formatInvoiceAmount(invoiceAmounts([item],{tax_amount:0,shipping_cost:0,discount_amount:0}).total)} ج.م</output><Button type="button" variant="ghost" size="icon" disabled={fields.length === 1} aria-label={`حذف البند ${index + 1}`} onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                        </div>;
                    })}
                    <Button type="button" variant="outline" disabled={fields.length >= 500} onClick={() => append({ item_type: 'finished_product', item_id: '', quantity: 1, unit_price: 0 })}><Plus className="ml-2 h-4 w-4" />إضافة صنف</Button>
                </section>
                <FormGrid className="grid-cols-2 lg:grid-cols-4">
                    {([['tax_amount', 'الضريبة'], ['shipping_cost', 'الشحن'], ['discount_amount', 'الخصم'], ['paid_amount', 'المدفوع عند الاعتماد']] as const).map(([key, label]) => <FormField key={key} label={label} error={form.formState.errors[key]?.message}><FormNumberInput aria-label={label} type="number" min="0" max="1000000000000" step="any" control={form.control} name={key} rules={{required: "أدخل قيمة", min: {value: 0, message: "القيمة لا يمكن أن تكون سالبة"}, max: {value: 1e12, message: "القيمة تتجاوز الحد المسموح"}}} /></FormField>)}
                </FormGrid>
                <p className="text-sm text-muted-foreground">يُسجّل المدفوع ويتحدث المخزون والحسابات عند اعتماد الفاتورة.</p>
                <FormField label="ملاحظات"><Textarea aria-label="ملاحظات" maxLength={2000} rows={3} {...form.register('notes')} /></FormField>
            </fieldset>
            {Object.keys(form.formState.errors).length > 0 && <p role="alert" className="text-destructive">راجع الحقول المطلوبة والكميات والأسعار.</p>}
            {save.isError && <div role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{save.error.message}{document && onReload && <Button type="button" variant="outline" className="mt-2 block" onClick={async () => { if (await exitGuard.confirmReplacement()) onReload(); }}>تحميل النسخة الأحدث</Button>}</div>}
            <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-sm md:bottom-0">
                <div><span className="block text-sm text-muted-foreground">الإجمالي</span><output className="text-xl font-bold">{formatInvoiceAmount(amounts.total)} ج.م</output></div>
                <Button type="submit" disabled={save.isPending || !options.data}>{save.isPending ? 'جارٍ الحفظ…' : document ? 'حفظ التعديلات' : 'حفظ المسودة'}</Button>
            </div>
        </form>
    </CardContent></Card>;
}
