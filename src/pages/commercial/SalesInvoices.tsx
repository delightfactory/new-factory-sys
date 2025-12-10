import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SalesInvoicesService, type SalesInvoice, type SalesInvoiceItem } from "@/services/SalesInvoicesService";
import { PartiesService } from "@/services/PartiesService";
import { TreasuriesService } from "@/services/TreasuriesService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Check, Trash2, MoreHorizontal, Eye, Ban, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField, FormGrid } from "@/components/ui/form-field";

export default function SalesInvoices() {
    const [activeTab, setActiveTab] = useState("list");
    const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: invoices } = useQuery({
        queryKey: ['sales_invoices'],
        queryFn: SalesInvoicesService.getInvoices
    });

    const processMutation = useMutation({
        mutationFn: SalesInvoicesService.processInvoice,
        onSuccess: () => {
            toast.success("تم اعتماد الفاتورة وتحديث المخزون والحسابات");
            queryClient.invalidateQueries({ queryKey: ['sales_invoices'] });
        },
        onError: (e) => toast.error("فشل الاعتماد: " + e.message)
    });

    const voidMutation = useMutation({
        mutationFn: SalesInvoicesService.voidInvoice,
        onSuccess: () => {
            toast.success("تم إلغاء الفاتورة واسترجاع المخزون والحسابات");
            queryClient.invalidateQueries({ queryKey: ['sales_invoices'] });
        },
        onError: (e) => toast.error("فشل الإلغاء: " + e.message)
    });

    const deleteMutation = useMutation({
        mutationFn: SalesInvoicesService.deleteInvoice,
        onSuccess: () => {
            toast.success("تم حذف المسودة بنجاح");
            queryClient.invalidateQueries({ queryKey: ['sales_invoices'] });
        },
        onError: (e) => toast.error("فشل الحذف: " + e.message)
    });

    const viewDetails = async (id: number) => {
        try {
            const data = await SalesInvoicesService.getInvoice(id);
            setSelectedInvoice(data);
        } catch (e) {
            toast.error("فشل تحميل التفاصيل");
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="فواتير المبيعات"
                description="تسجيل المبيعات للعملاء وتحديث المخزون"
                icon={ShoppingCart}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="list">قائمة الفواتير</TabsTrigger>
                    <TabsTrigger value="create">إنشاء فاتورة جديدة</TabsTrigger>
                </TabsList>

                <TabsContent value="list">
                    <Card>
                        <CardHeader><CardTitle>سجل الفواتير</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الفاتورة</TableHead>
                                        <TableHead>العميل</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                        <TableHead>المدفوع</TableHead>
                                        <TableHead>الحالة</TableHead>
                                        <TableHead>إجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices?.map((inv) => (
                                        <TableRow
                                            key={inv.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => navigate(`/commercial/selling/${inv.id}`)}
                                        >
                                            <TableCell className="font-medium">{inv.invoice_number || inv.id}</TableCell>
                                            <TableCell>{inv.customer?.name}</TableCell>
                                            <TableCell>{inv.transaction_date}</TableCell>
                                            <TableCell>{inv.total_amount.toLocaleString()}</TableCell>
                                            <TableCell>{inv.paid_amount.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Badge variant={inv.status === 'posted' ? 'default' : inv.status === 'void' ? 'destructive' : 'secondary'}>
                                                    {inv.status === 'posted' ? 'معتمدة' : inv.status === 'void' ? 'ملغاة' : 'مسودة'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>إجراءات</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={() => viewDetails(inv.id)}>
                                                            <Eye className="mr-2 h-4 w-4" /> عرض التفاصيل
                                                        </DropdownMenuItem>

                                                        {inv.status === 'draft' && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => {
                                                                    if (confirm("هل أنت متأكد من اعتماد الفاتورة؟ سيتم خصم الأصناف من المخزون.")) {
                                                                        processMutation.mutate(inv.id);
                                                                    }
                                                                }}>
                                                                    <Check className="mr-2 h-4 w-4" /> اعتماد
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600" onClick={() => {
                                                                    if (confirm("هل أنت متأكد من الحذف؟")) deleteMutation.mutate(inv.id);
                                                                }}>
                                                                    <Trash2 className="mr-2 h-4 w-4" /> حذف المسودة
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}

                                                        {inv.status === 'posted' && (
                                                            <DropdownMenuItem className="text-red-600" onClick={() => {
                                                                if (confirm("تحذير: إلغاء الفاتورة سيعكس جميع حركات المخزون والمالية. هل أنت متأكد؟")) voidMutation.mutate(inv.id);
                                                            }}>
                                                                <Ban className="mr-2 h-4 w-4" /> إلغاء الفاتورة (Void)
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="create">
                    <CreateInvoiceForm onSuccess={() => {
                        setActiveTab("list");
                        queryClient.invalidateQueries({ queryKey: ['sales_invoices'] });
                    }} />
                </TabsContent>
            </Tabs>

            {/* View Details Dialog */}
            <Dialog open={!!selectedInvoice} onOpenChange={(o) => !o && setSelectedInvoice(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>تفاصيل الفاتورة #{selectedInvoice?.invoice_number || selectedInvoice?.id}</DialogTitle>
                        <DialogDescription>حالة الفاتورة: {selectedInvoice?.status}</DialogDescription>
                    </DialogHeader>
                    {selectedInvoice && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b pb-4">
                                <div>
                                    <Label>العميل</Label>
                                    <div className="font-bold">{selectedInvoice.customer?.name}</div>
                                </div>
                                <div>
                                    <Label>التاريخ</Label>
                                    <div className="font-bold">{selectedInvoice.transaction_date}</div>
                                </div>
                                <div>
                                    <Label>الإجمالي</Label>
                                    <div className="font-bold text-lg">{selectedInvoice.total_amount.toLocaleString()}</div>
                                </div>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>الصنف</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>السعر</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(selectedInvoice as any).items?.map((item: any) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.item_type} #{item.raw_material_id || item.finished_product_id}</TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.unit_price}</TableCell>
                                            <TableCell>{item.total_price}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CreateInvoiceForm({ onSuccess }: { onSuccess: () => void }) {
    // Keep exact form code as previously read
    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
        defaultValues: {
            transaction_date: new Date().toISOString().split('T')[0],
            items: [{ item_type: 'finished_product', quantity: 1, unit_price: 0 }],
            tax_amount: 0,
            discount_amount: 0,
            shipping_cost: 0,
            paid_amount: 0
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: "items" });

    // Fetch Data (Customers)
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => PartiesService.getParties('customer') });
    const { data: treasuries } = useQuery({ queryKey: ['treasuries'], queryFn: TreasuriesService.getTreasuries });

    // Unified Inventory Fetcher
    const { data: inventoryItems } = useQuery({
        queryKey: ['all_inventory_items_sales'],
        queryFn: async () => {
            const [raw, pkg, semi, finished] = await Promise.all([
                supabase.from('raw_materials').select('id, name'),
                supabase.from('packaging_materials').select('id, name'),
                supabase.from('semi_finished_products').select('id, name'),
                supabase.from('finished_products').select('id, name')
            ]);
            return {
                raw_material: raw.data || [],
                packaging_material: pkg.data || [],
                semi_finished: semi.data || [],
                finished_product: finished.data || []
            };
        }
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const invoiceData: Partial<SalesInvoice> = {
                invoice_number: data.invoice_number,
                customer_id: data.customer_id,
                treasury_id: data.treasury_id || null,
                transaction_date: data.transaction_date,
                total_amount: data.final_total,
                paid_amount: data.paid_amount,
                tax_amount: data.tax_amount,
                discount_amount: data.discount_amount,
                shipping_cost: data.shipping_cost,
                status: 'draft'
            };

            const itemsData: SalesInvoiceItem[] = data.items.map((item: any) => {
                const map: any = {};
                if (item.item_type === 'raw_material') map.raw_material_id = parseInt(item.item_id);
                if (item.item_type === 'packaging_material') map.packaging_material_id = parseInt(item.item_id);
                if (item.item_type === 'semi_finished') map.semi_finished_product_id = parseInt(item.item_id);
                if (item.item_type === 'finished_product') map.finished_product_id = parseInt(item.item_id);

                return {
                    item_type: item.item_type,
                    ...map,
                    quantity: parseFloat(item.quantity),
                    unit_price: parseFloat(item.unit_price),
                    total_price: parseFloat(item.quantity) * parseFloat(item.unit_price)
                };
            });

            return SalesInvoicesService.createInvoice(invoiceData, itemsData);
        },
        onSuccess: () => {
            toast.success("تم حفظ فاتورة البيع بنجاح");
            onSuccess();
        },
        onError: (e) => toast.error("خطأ: " + e.message)
    });

    const items = watch('items');
    const tax = watch('tax_amount') || 0;
    const discount = watch('discount_amount') || 0;
    const shipping = watch('shipping_cost') || 0;

    const itemsTotal = items.reduce((sum: number, item: any) => {
        return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0));
    }, 0);

    const finalTotal = itemsTotal + parseFloat(tax) + parseFloat(shipping) - parseFloat(discount);

    const onSubmit = (data: any) => {
        createMutation.mutate({ ...data, final_total: finalTotal });
    };

    return (
        <Card>
            <CardHeader><CardTitle>بيانات الفاتورة</CardTitle></CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {/* Header Fields */}
                    {/* Header Fields */}
                    <FormGrid className="grid-cols-1 md:grid-cols-4">
                        <FormField label="العميل" required error={errors.customer_id?.message as string}>
                            <SearchableSelect
                                options={customers?.map((s) => ({
                                    value: s.id.toString(),
                                    label: s.name
                                })) || []}
                                value={watch('customer_id')?.toString()}
                                onValueChange={(val) => setValue('customer_id', val, { shouldValidate: true })}
                                placeholder="اختر العميل"
                                searchPlaceholder="ابحث عن عميل..."
                            />
                        </FormField>
                        <FormField label="تاريخ الفاتورة" required error={errors.transaction_date?.message as string}>
                            <Input type="date" {...register('transaction_date', { required: "مطلوب" })} />
                        </FormField>
                        <FormField label="رقم الفاتورة (اختياري)">
                            <Input {...register('invoice_number')} placeholder="AUTO" />
                        </FormField>
                        <FormField label="الخزنة (للدفع)">
                            <SearchableSelect
                                options={treasuries?.map((t) => ({
                                    value: t.id.toString(),
                                    label: t.name,
                                    description: `${t.balance}`
                                })) || []}
                                value={watch('treasury_id')?.toString()}
                                onValueChange={(val) => setValue('treasury_id', val)}
                                placeholder="اختر الخزنة"
                                searchPlaceholder="ابحث عن خزنة..."
                            />
                        </FormField>
                    </FormGrid>

                    {/* Items Section */}
                    <div className="border rounded-md p-3 sm:p-4 bg-muted/10">
                        <Label className="mb-2 block text-lg font-semibold">الأصناف</Label>

                        {/* Mobile Cards */}
                        <div className="block md:hidden space-y-3">
                            {fields.map((field, index) => {
                                const type = watch(`items.${index}.item_type`);
                                const list: any[] = inventoryItems ? (inventoryItems as any)[type] : [];
                                const qty = watch(`items.${index}.quantity`) || 0;
                                const price = watch(`items.${index}.unit_price`) || 0;
                                const total = (qty * price).toFixed(2);

                                return (
                                    <div key={field.id} className="bg-background border rounded-lg p-4 space-y-3 relative">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 left-2 h-8 w-8"
                                            onClick={() => remove(index)}
                                        >
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>

                                        <div className="pr-10">
                                            <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
                                            <Controller
                                                name={`items.${index}.item_type`}
                                                control={control}
                                                render={({ field }) => (
                                                    <Select onValueChange={(val) => { field.onChange(val); setValue(`items.${index}.item_id`, ''); }} value={field.value}>
                                                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="finished_product">منتج تام</SelectItem>
                                                            <SelectItem value="raw_material">خام</SelectItem>
                                                            <SelectItem value="packaging_material">تعبئة</SelectItem>
                                                            <SelectItem value="semi_finished">نصف مصنع</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>

                                        <div>
                                            <label className="text-xs text-muted-foreground mb-1 block">الصنف</label>
                                            <SearchableSelect
                                                options={list?.map((item: any) => ({
                                                    value: item.id.toString(),
                                                    label: item.name
                                                })) || []}
                                                value={watch(`items.${index}.item_id`)?.toString()}
                                                onValueChange={(val) => setValue(`items.${index}.item_id`, val, { shouldValidate: true })}
                                                placeholder="اختر الصنف"
                                                searchPlaceholder="ابحث..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs text-muted-foreground mb-1 block">الكمية</label>
                                                <Controller
                                                    name={`items.${index}.quantity`}
                                                    control={control}
                                                    rules={{ required: true, min: 0.01 }}
                                                    render={({ field }) => (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={field.value || ''}
                                                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                            onBlur={field.onBlur}
                                                            placeholder="0"
                                                        />
                                                    )}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-muted-foreground mb-1 block">السعر</label>
                                                <Controller
                                                    name={`items.${index}.unit_price`}
                                                    control={control}
                                                    rules={{ required: true, min: 0 }}
                                                    render={({ field }) => (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={field.value || ''}
                                                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                            onBlur={field.onBlur}
                                                            placeholder="0.00"
                                                        />
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t">
                                            <span className="text-sm text-muted-foreground">الإجمالي</span>
                                            <span className="font-bold text-primary">{total} ج.م</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {fields.length === 0 && (
                                <div className="text-center text-muted-foreground py-4 text-sm">لم يتم إضافة أصناف بعد</div>
                            )}
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[120px]">النوع</TableHead>
                                        <TableHead className="min-w-[180px]">الصنف</TableHead>
                                        <TableHead className="min-w-[80px]">الكمية</TableHead>
                                        <TableHead className="min-w-[100px]">السعر</TableHead>
                                        <TableHead className="min-w-[100px]">الإجمالي</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field, index) => {
                                        const type = watch(`items.${index}.item_type`);
                                        const list: any[] = inventoryItems ? (inventoryItems as any)[type] : [];

                                        return (
                                            <TableRow key={field.id}>
                                                <TableCell>
                                                    <Controller
                                                        name={`items.${index}.item_type`}
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select onValueChange={(val) => { field.onChange(val); setValue(`items.${index}.item_id`, ''); }} value={field.value}>
                                                                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="finished_product">منتج تام</SelectItem>
                                                                    <SelectItem value="raw_material">خام</SelectItem>
                                                                    <SelectItem value="packaging_material">تعبئة</SelectItem>
                                                                    <SelectItem value="semi_finished">نصف مصنع</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <SearchableSelect
                                                        options={list?.map((item: any) => ({
                                                            value: item.id.toString(),
                                                            label: item.name
                                                        })) || []}
                                                        value={watch(`items.${index}.item_id`)?.toString()}
                                                        onValueChange={(val) => setValue(`items.${index}.item_id`, val, { shouldValidate: true })}
                                                        placeholder="اختر الصنف"
                                                        searchPlaceholder="ابحث..."
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input type="number" step="0.01" className="h-8" {...register(`items.${index}.quantity`, { required: true, min: 0.01, valueAsNumber: true })} />
                                                </TableCell>
                                                <TableCell>
                                                    <Input type="number" step="0.01" className="h-8" {...register(`items.${index}.unit_price`, { required: true, min: 0, valueAsNumber: true })} />
                                                </TableCell>
                                                <TableCell>
                                                    {((parseFloat(watch(`items.${index}.quantity`) || "0") * parseFloat(watch(`items.${index}.unit_price`) || "0")).toFixed(2))}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="mt-2 w-full sm:w-auto" onClick={() => append({ item_type: 'finished_product', quantity: 1, unit_price: 0 })}>
                            <Plus className="w-4 h-4 mr-1" /> إضافة صنف
                        </Button>
                    </div>

                    {/* Totals & Payments - Same code */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-4">
                        <div className="space-y-4">
                            <Label>ملاحظات</Label>
                            <Input {...register('notes')} />
                        </div>
                        <div className="space-y-2 bg-muted p-4 rounded-lg">
                            <div className="flex justify-between items-center text-sm">
                                <span>إجمالي الأصناف:</span>
                                <span>{itemsTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
                                <Label className="text-sm shrink-0">م. الشحن (+):</Label>
                                <Input type="number" className="h-8 w-full sm:w-32" step="0.01" {...register('shipping_cost', { valueAsNumber: true })} />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
                                <Label className="text-sm shrink-0">الضريبة (+):</Label>
                                <Input type="number" className="h-8 w-full sm:w-32" step="0.01" {...register('tax_amount', { valueAsNumber: true })} />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
                                <Label className="text-sm shrink-0">الخصم (-):</Label>
                                <Input type="number" className="h-8 w-full sm:w-32" step="0.01" {...register('discount_amount', { valueAsNumber: true })} />
                            </div>
                            <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
                                <span>الصافي النهائي:</span>
                                <span>{finalTotal.toLocaleString()}</span>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2 mt-4 pt-4 border-t border-dashed">
                                <Label className="font-bold text-green-700 dark:text-green-400 shrink-0">المدفوع:</Label>
                                <Input type="number" className="h-10 w-full sm:w-32 font-bold" step="0.01" {...register('paid_amount', { valueAsNumber: true })} />
                            </div>
                            <div className="flex justify-between items-center text-sm text-red-600 dark:text-red-400 mt-1">
                                <span>المتبقي (آجل):</span>
                                <span>{(finalTotal - (watch('paid_amount') || 0)).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full text-lg h-12" disabled={createMutation.isPending}>
                        {createMutation.isPending ? "جاري الحفظ..." : "حفظ فاتورة البيع"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
