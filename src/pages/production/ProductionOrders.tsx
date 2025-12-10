import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type ProductionOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle, XCircle, Factory } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField, FormGrid } from "@/components/ui/form-field";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { useForm, useFieldArray } from "react-hook-form";
import { useState, useEffect } from "react";
import { Badge } from "../../components/ui/badge";
import { format } from "date-fns";
import { MaterialPreviewCard, type MaterialItem } from "@/components/ui/material-preview-card";

// Types for the form
type OrderFormValues = {
    code: string;
    date: string;
    notes: string;
    items: {
        semi_finished_id: string; // Form uses string
        quantity: number;
    }[];
};

export default function ProductionOrders() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [ingredientsData, setIngredientsData] = useState<Record<string, { batchSize: number; ingredients: any[] }>>({});
    const [loadingIngredients, setLoadingIngredients] = useState<Record<string, boolean>>({});

    // Fetch Orders
    const { data: orders, isLoading } = useQuery({
        queryKey: ['productionOrders'],
        queryFn: InventoryService.getProductionOrders,
    });

    // Fetch Products for Selection
    const { data: products } = useQuery({
        queryKey: ['semiFinishedProducts'],
        queryFn: InventoryService.getSemiFinishedProducts,
    });

    // Form Setup
    const form = useForm<OrderFormValues>({
        defaultValues: {
            code: '',
            date: new Date().toISOString().split('T')[0],
            notes: '',
            items: [{ semi_finished_id: "", quantity: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('production_orders', 'PO');
            form.setValue('code', code);
        } catch (error) {
            console.error("Failed to fetch next code", error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchNextCode();
        }
    }, [isOpen]);

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: OrderFormValues) => {
            const orderData = {
                code: data.code,
                date: data.date,
                notes: data.notes,
                status: 'pending' as const,
                total_cost: 0
            };
            const itemsData = data.items.map(item => ({
                semi_finished_id: Number(item.semi_finished_id),
                quantity: item.quantity
            }));
            return InventoryService.createProductionOrder(orderData, itemsData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
            setIsOpen(false);
            toast.success("تم إنشاء أمر الإنتاج بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    // Complete Mutation
    const completeMutation = useMutation({
        mutationFn: InventoryService.completeProductionOrder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
            toast.success("تم اكتمال الأمر وتحديث المخزون");
        },
        onError: (error) => toast.error("فشل تنفيذ الأمر: " + error.message)
    });

    const onSubmit = (data: OrderFormValues) => {
        createMutation.mutate(data);
    };

    const handleComplete = (id: number) => {
        if (confirm("هل أنت متأكد من إتمام هذا الأمر؟ سيتم خصم المواد الخام وإضافة المنتج للمخزون.")) {
            completeMutation.mutate(id);
        }
    };

    const cancelMutation = useMutation({
        mutationFn: async ({ id, isCompleted }: { id: number; isCompleted: boolean }) => {
            if (isCompleted) {
                return InventoryService.cancelProductionOrder(id);
            } else {
                return InventoryService.updateProductionOrderStatus(id, 'cancelled');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
            toast.success("تم إلغاء الأمر بنجاح");
        },
        onError: (error) => toast.error("فشل الإلغاء: " + error.message)
    });

    const handleCancel = (id: number, status: string) => {
        const isCompleted = status === 'completed';
        const message = isCompleted
            ? "تحذير دقيق: سيتم عكس عملية الإنتاج بالكامل. سيتم خصم المنتج من المخزون وإعادة المواد الخام إليه. هل أنت متأكد تماماً؟"
            : "هل تريد إلغاء هذا الأمر؟";

        if (confirm(message)) {
            cancelMutation.mutate({ id, isCompleted });
        }
    };

    const columns: ColumnDef<ProductionOrder>[] = [
        { accessorKey: "code", header: "رقم الأمر" },
        {
            accessorKey: "date",
            header: "التاريخ",
            cell: ({ row }) => format(new Date(row.getValue("date")), "dd/MM/yyyy")
        },
        {
            accessorKey: "status",
            header: "الحالة",
            cell: ({ row }) => {
                const status = row.getValue("status") as string;
                const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
                    pending: "secondary",
                    inProgress: "default",
                    completed: "outline", // Greenish usually better, handled via class
                    cancelled: "destructive"
                };
                const labels: Record<string, string> = {
                    pending: "قيد الانتظار",
                    inProgress: "جاري التنفيذ",
                    completed: "مكتمل",
                    cancelled: "ملغي"
                };
                return <Badge variant={variants[status]}>{labels[status] || status}</Badge>;
            }
        },
        { accessorKey: "notes", header: "ملاحظات" },
        {
            id: "actions",
            header: "إجراءات",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        {item.status === 'pending' && (
                            <>
                                <Button size="sm" onClick={() => handleComplete(item.id)} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="w-4 h-4 mr-1" /> إتمام
                                </Button>
                                {/* Setup cancel for pending (just status update) */}
                                <Button size="sm" variant="destructive" onClick={() => handleCancel(item.id, 'pending')}>
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                        {item.status === 'completed' && (
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive" onClick={() => handleCancel(item.id, 'completed')}>
                                <XCircle className="w-4 h-4 mr-1" /> إلغاء وعكس
                            </Button>
                        )}
                    </div>
                );
            }
        }
    ];

    if (isLoading) return (
        <div className="space-y-6">
            <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            <CardGridSkeleton count={3} />
        </div>
    );
    // Error handling block
    if ((orders as any)?.error) return <div className="p-10 text-destructive text-center">حدث خطأ: {(orders as any).error}</div>;

    return (
        <div className="space-y-6">
            <PageHeader
                title="أوامر الإنتاج"
                description="إدارة عمليات التصنيع ومتابعة الحالة"
                icon={Factory}
                actions={
                    <Button onClick={() => { form.reset(); setIsOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> أمر إنتاج جديد
                    </Button>
                }
            />

            {orders && orders.length > 0 ? (
                <DataTable columns={columns} data={orders} />
            ) : (
                <EmptyState
                    icon={Factory}
                    title="لا توجد أوامر إنتاج"
                    description="ابدأ بإنشاء أول أمر إنتاج"
                    action={
                        <Button onClick={() => { form.reset(); setIsOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> أمر إنتاج جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>إنشاء أمر إنتاج جديد</DialogTitle>
                        <DialogDescription>أدخل تفاصيل أمر الإنتاج الجديد.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormGrid>
                            <FormField label="رقم الأمر" required error={form.formState.errors.code?.message}>
                                <Input {...form.register("code", { required: "مطلوب" })} readOnly />
                            </FormField>
                            <FormField label="التاريخ" required error={form.formState.errors.date?.message}>
                                <Input type="date" {...form.register("date", { required: "مطلوب" })} />
                            </FormField>
                            <FormField label="ملاحظات" className="col-span-1 md:col-span-2">
                                <Textarea {...form.register("notes")} />
                            </FormField>
                        </FormGrid>

                        <div className="space-y-4 border rounded p-4 bg-muted/20">
                            <h3 className="font-medium flex items-center gap-2">
                                المنتجات المطلوب تصنيعها
                                <Badge variant="outline" className="text-xs">{fields.length}</Badge>
                            </h3>

                            {fields.map((field, index) => {
                                const selectedProductId = form.watch(`items.${index}.semi_finished_id`);
                                const selectedQuantity = form.watch(`items.${index}.quantity`) || 0;
                                const productIngredients = ingredientsData[selectedProductId];
                                const isLoadingIng = loadingIngredients[selectedProductId];

                                // Fetch ingredients when product is selected
                                const handleProductChange = async (val: string) => {
                                    form.setValue(`items.${index}.semi_finished_id`, val);
                                    if (val && !ingredientsData[val]) {
                                        setLoadingIngredients(prev => ({ ...prev, [val]: true }));
                                        try {
                                            const data = await InventoryService.getSemiFinishedIngredientsWithStock(Number(val));
                                            setIngredientsData(prev => ({ ...prev, [val]: data }));
                                        } catch (error) {
                                            console.error('Failed to fetch ingredients', error);
                                        } finally {
                                            setLoadingIngredients(prev => ({ ...prev, [val]: false }));
                                        }
                                    }
                                };

                                // Calculate required materials based on quantity and batch size
                                const materialItems: MaterialItem[] = (() => {
                                    if (!productIngredients || selectedQuantity <= 0) return [];
                                    const ratio = selectedQuantity / productIngredients.batchSize;
                                    return productIngredients.ingredients.map(ing => ({
                                        id: ing.id,
                                        name: ing.name,
                                        unit: ing.unit,
                                        requiredQty: Math.round(ing.quantityPerBatch * ratio * 100) / 100,
                                        availableQty: ing.availableStock
                                    }));
                                })();

                                return (
                                    <div key={field.id} className="space-y-3">
                                        <div className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-7 md:col-span-8">
                                                <FormField label="المنتج (نصف مصنع)" className="space-y-1">
                                                    <SearchableSelect
                                                        options={products?.map(p => ({
                                                            value: p.id.toString(),
                                                            label: p.name,
                                                            description: `${p.unit} - رصيد: ${p.quantity}`
                                                        })) || []}
                                                        value={selectedProductId}
                                                        onValueChange={handleProductChange}
                                                        placeholder="اختر منتج..."
                                                        searchPlaceholder="ابحث عن منتج..."
                                                    />
                                                </FormField>
                                            </div>
                                            <div className="col-span-4 md:col-span-3">
                                                <FormField label="الكمية المطلوبة" className="space-y-1" error={form.formState.errors.items?.[index]?.quantity?.message}>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        {...form.register(`items.${index}.quantity` as const, { valueAsNumber: true, required: "مطلوب" })}
                                                    />
                                                </FormField>
                                            </div>
                                            <div className="col-span-1 pb-2">
                                                <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}>
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Material Preview Card */}
                                        {(selectedProductId && selectedQuantity > 0) && (
                                            <MaterialPreviewCard
                                                title={`المواد الخام المطلوبة (${products?.find(p => p.id.toString() === selectedProductId)?.name || ''})`}
                                                materials={materialItems}
                                                isLoading={isLoadingIng}
                                                className="mr-4"
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <Button type="button" variant="outline" size="sm" onClick={() => append({ semi_finished_id: "", quantity: 0 })} className="w-full">
                                <Plus className="h-4 w-4 mr-1" /> إضافة منتج آخر
                            </Button>
                        </div>

                        <div className="flex justify-end pt-4 border-t gap-3">
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>إلغاء</Button>
                            <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء الأمر"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
