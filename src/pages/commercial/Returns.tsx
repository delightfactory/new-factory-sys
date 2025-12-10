import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PurchaseInvoicesService } from "@/services/PurchaseInvoicesService";
import { SalesInvoicesService } from "@/services/SalesInvoicesService";
import { PurchaseReturnsService } from "@/services/PurchaseReturnsService";
import { SalesReturnsService } from "@/services/SalesReturnsService";
import { PartiesService } from "@/services/PartiesService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { Plus, Trash2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";

export default function Returns() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="إدارة المرتجعات"
                description="تسجيل مرتجعات الشراء والمبيعات"
                icon={RotateCcw}
            />

            <Tabs defaultValue="purchase">
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                    <TabsTrigger value="purchase">مرتجعات الشراء (للموردين)</TabsTrigger>
                    <TabsTrigger value="sales">مرتجعات البيع (من العملاء)</TabsTrigger>
                </TabsList>

                <TabsContent value="purchase">
                    <PurchaseReturnsList />
                </TabsContent>

                <TabsContent value="sales">
                    <SalesReturnsList />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// --- Purchase Returns ---

function PurchaseReturnsList() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: returns } = useQuery({
        queryKey: ['purchase_returns'],
        queryFn: PurchaseReturnsService.getReturns
    });

    const processMutation = useMutation({
        mutationFn: PurchaseReturnsService.processReturn,
        onSuccess: () => {
            toast.success("تم اعتماد المرتجع وتحديث المخزون");
            queryClient.invalidateQueries({ queryKey: ['purchase_returns'] });
        },
        onError: (e) => toast.error("خطأ: " + e.message)
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> مرتجع شراء جديد</Button>
            </div>

            <Card>
                <CardHeader><CardTitle>سجل مرتجعات الشراء</CardTitle></CardHeader>
                <CardContent className="p-0 sm:p-6">
                    {/* Mobile Cards */}
                    <div className="block sm:hidden divide-y">
                        {returns?.map((ret) => (
                            <div key={ret.id} className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">#{ret.return_number || ret.id}</span>
                                    <Badge variant={ret.status === 'posted' ? 'default' : 'secondary'}>
                                        {ret.status === 'posted' ? 'معتمد' : 'مسودة'}
                                    </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">{ret.supplier?.name}</div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>{ret.return_date}</span>
                                    <span className="font-bold">{ret.total_amount?.toLocaleString()} ج.م</span>
                                </div>
                                {ret.status === 'draft' && (
                                    <Button size="sm" className="w-full mt-2" onClick={() => {
                                        if (confirm("اعتماد المرتجع سيخصم الكميات من المخزون ويحدث رصيد المورد. هل أنت متأكد؟"))
                                            processMutation.mutate(ret.id);
                                    }}>
                                        <Check className="mr-2 h-4 w-4" /> اعتماد
                                    </Button>
                                )}
                            </div>
                        ))}
                        {(!returns || returns.length === 0) && (
                            <div className="p-4 text-center text-muted-foreground">لا توجد مرتجعات</div>
                        )}
                    </div>
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>رقم المرتجع</TableHead>
                                    <TableHead>المورد</TableHead>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>الإجمالي</TableHead>
                                    <TableHead>الحالة</TableHead>
                                    <TableHead>إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {returns?.map((ret) => (
                                    <TableRow key={ret.id}>
                                        <TableCell>{ret.return_number || ret.id}</TableCell>
                                        <TableCell>{ret.supplier?.name}</TableCell>
                                        <TableCell>{ret.return_date}</TableCell>
                                        <TableCell>{ret.total_amount}</TableCell>
                                        <TableCell>
                                            <Badge variant={ret.status === 'posted' ? 'default' : 'secondary'}>
                                                {ret.status === 'posted' ? 'معتمد' : 'مسودة'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {ret.status === 'draft' && (
                                                <Button size="sm" onClick={() => {
                                                    if (confirm("اعتماد المرتجع سيخصم الكميات من المخزون ويحدث رصيد المورد. هل أنت متأكد؟"))
                                                        processMutation.mutate(ret.id);
                                                }}>
                                                    <Check className="mr-2 h-4 w-4" /> اعتماد
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>مرتجع شراء جديد</DialogTitle>
                        <DialogDescription>تسجيل مرتجع سلع أو خامات إلى المورد.</DialogDescription>
                    </DialogHeader>
                    <CreateReturnForm type="purchase" onSuccess={() => setIsCreateOpen(false)} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

// --- Sales Returns ---

function SalesReturnsList() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: returns } = useQuery({
        queryKey: ['sales_returns'],
        queryFn: SalesReturnsService.getReturns
    });

    const processMutation = useMutation({
        mutationFn: SalesReturnsService.processReturn,
        onSuccess: () => {
            toast.success("تم اعتماد المرتجع وتحديث المخزون");
            queryClient.invalidateQueries({ queryKey: ['sales_returns'] });
        },
        onError: (e) => toast.error("خطأ: " + e.message)
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> مرتجع بيع جديد</Button>
            </div>

            <Card>
                <CardHeader><CardTitle>سجل مرتجعات البيع</CardTitle></CardHeader>
                <CardContent className="p-0 sm:p-6">
                    {/* Mobile Cards */}
                    <div className="block sm:hidden divide-y">
                        {returns?.map((ret) => (
                            <div key={ret.id} className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">#{ret.return_number || ret.id}</span>
                                    <Badge variant={ret.status === 'posted' ? 'default' : 'secondary'}>
                                        {ret.status === 'posted' ? 'معتمد' : 'مسودة'}
                                    </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">{ret.customer?.name}</div>
                                <div className="flex items-center justify-between text-sm">
                                    <span>{ret.return_date}</span>
                                    <span className="font-bold">{ret.total_amount?.toLocaleString()} ج.م</span>
                                </div>
                                {ret.status === 'draft' && (
                                    <Button size="sm" className="w-full mt-2" onClick={() => {
                                        if (confirm("اعتماد المرتجع سيضيف الكميات للمخزون ويحدث رصيد العميل. هل أنت متأكد؟"))
                                            processMutation.mutate(ret.id);
                                    }}>
                                        <Check className="mr-2 h-4 w-4" /> اعتماد
                                    </Button>
                                )}
                            </div>
                        ))}
                        {(!returns || returns.length === 0) && (
                            <div className="p-4 text-center text-muted-foreground">لا توجد مرتجعات</div>
                        )}
                    </div>
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>رقم المرتجع</TableHead>
                                    <TableHead>العميل</TableHead>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>الإجمالي</TableHead>
                                    <TableHead>الحالة</TableHead>
                                    <TableHead>إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {returns?.map((ret) => (
                                    <TableRow key={ret.id}>
                                        <TableCell>{ret.return_number || ret.id}</TableCell>
                                        <TableCell>{ret.customer?.name}</TableCell>
                                        <TableCell>{ret.return_date}</TableCell>
                                        <TableCell>{ret.total_amount}</TableCell>
                                        <TableCell>
                                            <Badge variant={ret.status === 'posted' ? 'default' : 'secondary'}>
                                                {ret.status === 'posted' ? 'معتمد' : 'مسودة'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {ret.status === 'draft' && (
                                                <Button size="sm" onClick={() => {
                                                    if (confirm("اعتماد المرتجع سيضيف الكميات للمخزون ويحدث رصيد العميل. هل أنت متأكد؟"))
                                                        processMutation.mutate(ret.id);
                                                }}>
                                                    <Check className="mr-2 h-4 w-4" /> اعتماد
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>مرتجع بيع جديد</DialogTitle>
                        <DialogDescription>تسجيل مرتجع منتجات من عميل.</DialogDescription>
                    </DialogHeader>
                    <CreateReturnForm type="sales" onSuccess={() => setIsCreateOpen(false)} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

// --- Shared Create Form ---

interface ReturnItemForm {
    item_type: 'raw_material' | 'packaging_material' | 'semi_finished' | 'finished_product';
    item_id: string; // Stored as string in Select value
    quantity: number;
    unit_price: number;
}

interface ReturnFormValues {
    party_id: string;
    invoice_id?: string;
    return_date: string;
    items: ReturnItemForm[];
    notes: string;
}

function CreateReturnForm({ type, onSuccess }: { type: 'purchase' | 'sales', onSuccess: () => void }) {
    const queryClient = useQueryClient();
    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReturnFormValues>({
        defaultValues: {
            party_id: '',
            invoice_id: '',
            return_date: new Date().toISOString().split('T')[0],
            items: [{ item_type: 'finished_product', item_id: '', quantity: 1, unit_price: 0 }],
            notes: ''
        }
    });

    const { fields, append, remove } = useFieldArray({ control, name: "items" });

    // Watchers
    const selectedPartyId = watch('party_id');
    const selectedInvoiceId = watch('invoice_id');

    // Fetch Parties
    const { data: parties } = useQuery({
        queryKey: ['parties', type === 'purchase' ? 'supplier' : 'customer'],
        queryFn: () => PartiesService.getParties(type === 'purchase' ? 'supplier' : 'customer')
    });

    // Fetch Posted Invoices for Party
    const { data: invoices } = useQuery({
        queryKey: ['invoices_for_return', type, selectedPartyId],
        queryFn: async () => {
            if (!selectedPartyId) return [];
            return type === 'purchase'
                ? PurchaseInvoicesService.getPostedInvoices(selectedPartyId)
                : SalesInvoicesService.getPostedInvoices(selectedPartyId);
        },
        enabled: !!selectedPartyId
    });

    // Fetch Selected Invoice Details (for Price Matching)
    const { data: selectedInvoice } = useQuery({
        queryKey: ['invoice_details_for_return', type, selectedInvoiceId],
        queryFn: async () => {
            if (!selectedInvoiceId) return null;
            return type === 'purchase'
                ? PurchaseInvoicesService.getInvoice(parseInt(selectedInvoiceId))
                : SalesInvoicesService.getInvoice(parseInt(selectedInvoiceId));
        },
        enabled: !!selectedInvoiceId
    });

    // Helper: Find Price in Invoice
    const findPriceInInvoice = (itemType: string, itemId: string) => {
        if (!selectedInvoice || !selectedInvoice.items) return null;
        const idInt = parseInt(itemId);

        const found = selectedInvoice.items.find((invItem: any) => {
            if (invItem.item_type !== itemType) return false;
            // Match ID based on type
            if (itemType === 'raw_material') return invItem.raw_material_id === idInt;
            if (itemType === 'packaging_material') return invItem.packaging_material_id === idInt;
            if (itemType === 'finished_product') return invItem.finished_product_id === idInt;
            if (itemType === 'semi_finished') return invItem.semi_finished_product_id === idInt;
            return false;
        });

        return found ? found.unit_price : null;
    };

    // Fetch Inventory Items (Unified)
    const { data: inventoryItems } = useQuery({
        queryKey: ['inventory_items_returns'],
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
            const total = data.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);

            const returnData = {
                [type === 'purchase' ? 'supplier_id' : 'customer_id']: data.party_id,
                return_date: data.return_date,
                total_amount: total,
                status: 'draft',
                notes: data.notes
            };
            // Add invoice reference if selected (store in notes or separate field if schema supports?)
            // Currently schema doesn't seem to have 'invoice_id' in returns table. 
            // We'll append it to notes for reference or just use it for price fetching.
            if (data.invoice_id) {
                returnData.notes = (returnData.notes || "") + ` [Linked to Invoice #${data.invoice_id}]`;
            }

            const itemsData = data.items.map((item: any) => {
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

            if (type === 'purchase') {
                return PurchaseReturnsService.createReturn(returnData as any, itemsData);
            } else {
                return SalesReturnsService.createReturn(returnData as any, itemsData);
            }
        },
        onSuccess: () => {
            toast.success("تم إنشاء المرتجع بنجاح");
            onSuccess();
            queryClient.invalidateQueries({ queryKey: [type === 'purchase' ? 'purchase_returns' : 'sales_returns'] });
        },
        onError: (e) => toast.error("فشل الحفظ: " + e.message)
    });

    const onSubmit = (data: any) => {
        createMutation.mutate(data);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormGrid className="grid-cols-1 md:grid-cols-3">
                <FormField label={type === 'purchase' ? 'المورد' : 'العميل'} required error={errors.party_id?.message}>
                    <SearchableSelect
                        options={parties?.map((p) => ({
                            value: p.id.toString(),
                            label: p.name
                        })) || []}
                        value={watch('party_id')?.toString()}
                        onValueChange={(val) => {
                            setValue('party_id', val, { shouldValidate: true });
                            setValue('invoice_id', ''); // Reset invoice when party changes
                        }}
                        placeholder="اختر الجهة"
                        searchPlaceholder="ابحث عن جهة..."
                    />
                </FormField>

                <FormField label="ربط بفاتورة (اختياري)">
                    <SearchableSelect
                        options={invoices?.map((inv) => ({
                            value: inv.id.toString(),
                            label: `#${inv.invoice_number || inv.id} (${inv.total_amount} ج.م) - ${inv.transaction_date}`
                        })) || []}
                        value={watch('invoice_id')?.toString()}
                        onValueChange={(val) => setValue('invoice_id', val)}
                        placeholder={!selectedPartyId ? "اختر الطرف أولاً" : invoices && invoices.length > 0 ? "اختر الفاتورة" : "لا توجد فواتير"}
                        searchPlaceholder="ابحث عن فاتورة..."
                        disabled={!selectedPartyId || !invoices?.length}
                    />
                    {selectedInvoiceId && <p className="text-xs text-green-600 dark:text-green-400 mt-1">سيتم جلب الأسعار تلقائياً من الفاتورة عند اختيار الأصناف.</p>}
                </FormField>

                <FormField label="تاريخ المرتجع" required error={errors.return_date?.message}>
                    <Input type="date" {...register('return_date', { required: "مطلوب" })} />
                </FormField>
            </FormGrid>

            <div className="border rounded p-3 sm:p-4 bg-muted/10">
                <h3 className="text-sm font-medium mb-3">الأصناف المرتجعة</h3>

                {/* Mobile Cards */}
                <div className="block md:hidden space-y-3">
                    {fields.map((field, index) => {
                        const itemType = watch(`items.${index}.item_type`);
                        const list = inventoryItems ? (inventoryItems as any)[itemType] : [];

                        return (
                            <div key={field.id} className="bg-background border rounded-lg p-4 space-y-3 relative">
                                <Button
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
                                        options={list?.map((i: any) => ({
                                            value: i.id.toString(),
                                            label: i.name
                                        })) || []}
                                        value={watch(`items.${index}.item_id`)?.toString()}
                                        onValueChange={(val) => {
                                            setValue(`items.${index}.item_id`, val, { shouldValidate: true });
                                            if (selectedInvoiceId) {
                                                const price = findPriceInInvoice(itemType, val);
                                                if (price !== null && price !== undefined) {
                                                    setValue(`items.${index}.unit_price`, price);
                                                    toast.info("تم جلب سعر الشراء من الفاتورة");
                                                }
                                            }
                                        }}
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
                                            rules={{ required: true }}
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
                                            rules={{ required: true }}
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
                                <TableHead className="min-w-[100px]">الكمية</TableHead>
                                <TableHead className="min-w-[100px]">السعر (للوحدة)</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((field, index) => {
                                const itemType = watch(`items.${index}.item_type`);
                                const list = inventoryItems ? (inventoryItems as any)[itemType] : [];

                                return (
                                    <TableRow key={field.id}>
                                        <TableCell>
                                            <Controller
                                                name={`items.${index}.item_type`}
                                                control={control}
                                                render={({ field }) => (
                                                    <Select onValueChange={(val) => { field.onChange(val); setValue(`items.${index}.item_id`, ''); }} value={field.value}>
                                                        <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
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
                                                options={list?.map((i: any) => ({
                                                    value: i.id.toString(),
                                                    label: i.name
                                                })) || []}
                                                value={watch(`items.${index}.item_id`)?.toString()}
                                                onValueChange={(val) => {
                                                    setValue(`items.${index}.item_id`, val, { shouldValidate: true });
                                                    if (selectedInvoiceId) {
                                                        const price = findPriceInInvoice(itemType, val);
                                                        if (price !== null && price !== undefined) {
                                                            setValue(`items.${index}.unit_price`, price);
                                                            toast.info("تم جلب سعر الشراء من الفاتورة");
                                                        }
                                                    }
                                                }}
                                                placeholder="اختر الصنف"
                                                searchPlaceholder="ابحث..."
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input type="number" step="0.01" {...register(`items.${index}.quantity`, { required: true, valueAsNumber: true })} placeholder="الكمية" />
                                        </TableCell>
                                        <TableCell>
                                            <Input type="number" step="0.01" {...register(`items.${index}.unit_price`, { required: true, valueAsNumber: true })} placeholder="السعر" />
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

                <Button type="button" variant="outline" size="sm" onClick={() => append({ item_type: 'finished_product', item_id: '', quantity: 1, unit_price: 0 })} className="mt-3 w-full sm:w-auto">
                    <Plus className="mr-1 h-4 w-4" /> إضافة صنف
                </Button>
            </div>

            <FormField label="ملاحظات">
                <Input {...register('notes')} />
            </FormField>

            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ المرتجع"}
            </Button>
        </form>
    );
}
