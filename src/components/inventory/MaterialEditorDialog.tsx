import { FormNumberInput } from '@/components/ui/number-input';
import { Fragment } from 'react';
import { RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormGrid } from '@/components/ui/form-field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { finiteMaterialNumber } from '@/features/inventory/material-editor';
import type { useMaterialEditor } from '@/hooks/use-material-editor';

export function MaterialEditorDialog({ editor }: { editor: ReturnType<typeof useMaterialEditor> }) {
    const { form, workspace, labels, kind } = editor;
    const edit = workspace.id !== null, errors = form.formState.errors;
    const fieldId = (field: string) => `${kind}-editor-${field}`;
    const errorProps = (field: keyof typeof errors) => ({
        id: fieldId(field), 'aria-invalid': !!errors[field],
        'aria-required': field !== 'quantity' || !edit,
        'aria-describedby': errors[field] ? `${fieldId(field)}-error` : undefined,
    });
    const numberFields = [
        { name: 'min_stock', label: 'حد الأمان' },
        { name: 'unit_cost', label: 'تكلفة الوحدة' },
        { name: 'sales_price', label: 'سعر البيع' },
        { name: 'quantity', label: edit ? 'الرصيد عند فتح النموذج' : 'الكمية الافتتاحية' },
    ] as const;
    return <>
        <Dialog open={workspace.open} onOpenChange={open => { if (!open) void workspace.close(); }}>
            <DialogContent task className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{edit ? 'تعديل' : 'إضافة'} {labels.title}</DialogTitle>
                    <DialogDescription>{edit ? 'عند التعديل من أكثر من مستخدم تُعتمد آخر عملية حفظ. الكمية للعرض فقط، وتغيير التكلفة صراحةً يعيد تقييم الرصيد الحالي عند الحفظ.' : 'أدخل تعريف الصنف والكمية والتكلفة الافتتاحية.'}</DialogDescription>
                </DialogHeader>
                {workspace.state === 'loading' && <p role="status">جارٍ تحميل بيانات الصنف…</p>}
                {workspace.state === 'error' && <div role="alert" className="space-y-3"><p>تعذر تحميل الصنف. لم نعرض نموذجًا فارغًا، والحفظ غير متاح.</p><Button onClick={() => { if (workspace.id !== null) editor.edit(workspace.id); }}>إعادة المحاولة</Button></div>}
                {workspace.state === 'ready' && <form noValidate onSubmit={form.handleSubmit(editor.submit)} className="space-y-4">
                    <fieldset disabled={workspace.locked} className="space-y-4 min-w-0">
                        <FormGrid>
                            <FormField label="الكود" htmlFor={fieldId('code')} required error={errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...errorProps('code')} {...form.register('code', { validate: value => !!value?.trim() || 'أدخل كود الصنف.' })} readOnly={edit} placeholder={`${labels.prefix}-001`} />
                                    {!edit && <Button type="button" variant="outline" size="icon" aria-label="اقتراح كود جديد" disabled={editor.codePending} onClick={() => void editor.suggestCode()}><RefreshCcw className="h-4 w-4" /></Button>}
                                </div>
                                {editor.codePending && <p role="status" className="text-xs text-muted-foreground">جارٍ اقتراح كود. يمكنك إدخاله يدويًا.</p>}
                            </FormField>
                            <FormField label="الاسم" htmlFor={fieldId('name')} required error={errors.name?.message}>
                                <Input {...errorProps('name')} {...form.register('name', { validate: value => !!value?.trim() || 'أدخل اسم الصنف.' })} placeholder="اسم المادة" />
                            </FormField>
                            <FormField label="الوحدة" htmlFor={fieldId('unit')} required error={errors.unit?.message}>
                                <Input {...errorProps('unit')} {...form.register('unit', { validate: value => !!value?.trim() || 'أدخل وحدة الصنف.' })} placeholder="كجم / لتر / قطعة" />
                            </FormField>
                            {numberFields.map(field => <FormField key={field.name} label={field.label} htmlFor={fieldId(field.name)} required={field.name !== 'quantity' || !edit} error={errors[field.name]?.message}>
                                <FormNumberInput {...errorProps(field.name)} type="number" step="any" readOnly={edit && field.name === 'quantity'}
                                    onChange={event => { if (field.name === 'unit_cost') editor.costChanged(event.target.valueAsNumber); }}
                                    control={form.control} name={field.name} rules={{validate: value => finiteMaterialNumber(typeof value === 'number' ? value : NaN)}} />
                                {edit && field.name === 'quantity' && <p className="text-xs text-muted-foreground">تعديل الرصيد يتم عبر التسويات والأوامر؛ لا يُرسل من هذا النموذج.</p>}
                                {edit && field.name === 'unit_cost' && workspace.overrideCost && <p role="status" className="text-sm text-amber-700">سيُعاد تقييم الرصيد الحالي بالتكلفة التي أدخلتها عند الحفظ.</p>}
                            </FormField>)}
                        </FormGrid>
                        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                            <Button type="button" variant="outline" onClick={() => void workspace.close()}>إلغاء</Button>
                            <Button type="submit" disabled={edit && !form.formState.isDirty}>{workspace.saving ? 'جارٍ الحفظ…' : 'حفظ البيانات'}</Button>
                        </div>
                    </fieldset>
                    {workspace.uncertain && <div role="alert" className="space-y-3 rounded-lg border border-amber-400 p-4"><p>تعذر تأكيد نتيجة الحفظ. قد تكون العملية نُفذت. البيانات مقفلة حتى نتحقق من نفس الطلب.</p><Button type="button" disabled={workspace.saving} onClick={() => void workspace.retrySave()}>إعادة الحفظ بنفس البيانات</Button></div>}
                </form>}
            </DialogContent>
        </Dialog>
        {workspace.confirmations.map((confirmation, index) => <Fragment key={index}>{confirmation}</Fragment>)}
    </>;
}
