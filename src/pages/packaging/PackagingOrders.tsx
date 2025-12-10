import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type PackagingOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle, XCircle, Package } from "lucide-react";
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
        finished_product_id: string; // Form uses string
        quantity: number;
    }[];
};

export default function PackagingOrders() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [requirementsData, setRequirementsData] = useState<Record<string, { semiFinished: any; packagingMaterials: any[] }>>({});
    const [loadingRequirements, setLoadingRequirements] = useState<Record<string, boolean>>({});

    // Fetch Orders
    const { data: orders, isLoading } = useQuery({
        queryKey: ['packagingOrders'],
        queryFn: InventoryService.getPackagingOrders,
    });

    // Fetch Products for Selection
    const { data: products } = useQuery({
        queryKey: ['finishedProducts'],
        queryFn: InventoryService.getFinishedProducts,
    });

    // Form Setup
    const form = useForm<OrderFormValues>({
        defaultValues: {
            code: '',
            date: new Date().toISOString().split('T')[0],
            notes: '',
            items: [{ finished_product_id: "", quantity: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('packaging_orders', 'PK');
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
                status: 'pending',
                total_cost: 0
            };
            const itemsData = data.items.map(item => ({
                finished_product_id: Number(item.finished_product_id),
                quantity: item.quantity
            }));
            return InventoryService.createPackagingOrder(orderData, itemsData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingOrders'] });
            setIsOpen(false);
            toast.success("تم إنشاء أمر التعبئة بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    // Complete Mutation
    const completeMutation = useMutation({
        mutationFn: InventoryService.completePackagingOrder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingOrders'] });
            toast.success("تم اكتمال الأمر وتحديث المخزون");
        },
        onError: (error) => toast.error("فشل تنفيذ الأمر: " + error.message)
    });

    // Cancel Mutation
    const cancelMutation = useMutation({
        mutationFn: async ({ id, isCompleted }: { id: number; isCompleted: boolean }) => {
            if (isCompleted) {
                return InventoryService.cancelPackagingOrder(id);
            } else {
                return InventoryService.updatePackagingOrderStatus(id, 'cancelled');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingOrders'] });
            toast.success("تم إلغاء الأمر وعكس العمليات المخزنية");
        },
        onError: (error) => toast.error("فشل الإلغاء: " + error.message)
    });

    const onSubmit = (data: OrderFormValues) => {
        createMutation.mutate(data);
    };

    const handleComplete = (id: number) => {
        if (confirm("هل أنت متأكد من إتمام هذا الأمر؟ سيتم خصم المكونات وإضافة المنتج النهائي للمخزون.")) {
            completeMutation.mutate(id);
        }
    };

    const handleCancel = (id: number, status: string) => {
        const isCompleted = status === 'completed';
        const message = isCompleted
            ? "تحذير: سيتم عكس عملية التعبئة. سيتم إعادة المكونات للمخزون وخصم المنتج النهائي. هل أنت متأكد؟"
            : "هل تريد إلغاء هذا الأمر؟";

        if (confirm(message)) {
            cancelMutation.mutate({ id, isCompleted });
        }
    };

    const columns: ColumnDef<PackagingOrder>[] = [
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
                    completed: "outline",
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

    // Debug Error Handling
    if ((orders as any)?.error) return <div className="p-10 text-destructive text-center">خطأ في تحميل الأوامر: {(orders as any).error.message} <br /> يرجى التأكد من تشغيل الترحيل: 20240111000000_fix_packaging_schema.sql</div>;
    if ((products as any)?.error) return <div className="p-10 text-destructive text-center">خطأ في تحميل المنتجات: {(products as any).error.message}</div>;

    return (
        <div className="space-y-6">
            <PageHeader
                title="أوامر التعبئة"
                description="تعبئة المنتجات النهائية ومتابعة المخزون"
                icon={Package}
                actions={
                    <Button onClick={() => { form.reset(); setIsOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> أمر تعبئة جديد
                    </Button>
                }
            />

            {orders && orders.length > 0 ? (
                <DataTable columns={columns} data={orders} />
            ) : (
                <EmptyState
                    icon={Package}
                    title="لا توجد أوامر تعبئة"
                    description="ابدأ بإنشاء أول أمر تعبئة"
                    action={
                        <Button onClick={() => { form.reset(); setIsOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> أمر تعبئة جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>إنشاء أمر تعبئة جديد</DialogTitle>
                        <DialogDescription>أدخل تفاصيل أمر التعبئة الجديد.</DialogDescription>
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
                                المنتجات المطلوب تعبئتها
                                <Badge variant="outline" className="text-xs">{fields.length}</Badge>
                            </h3>

                            {fields.map((field, index) => {
                                const selectedProductId = form.watch(`items.${index}.finished_product_id`);
                                const selectedQuantity = form.watch(`items.${index}.quantity`) || 0;
                                const productRequirements = requirementsData[selectedProductId];
                                const isLoadingReq = loadingRequirements[selectedProductId];

                                // Fetch requirements when product is selected
                                const handleProductChange = async (val: string) => {
                                    form.setValue(`items.${index}.finished_product_id`, val);
                                    if (val && !requirementsData[val]) {
                                        setLoadingRequirements(prev => ({ ...prev, [val]: true }));
                                        try {
                                            const data = await InventoryService.getFinishedProductRequirementsWithStock(Number(val));
                                            setRequirementsData(prev => ({ ...prev, [val]: data }));
                                        } catch (error) {
                                            console.error('Failed to fetch requirements', error);
                                        } finally {
                                            setLoadingRequirements(prev => ({ ...prev, [val]: false }));
                                        }
                                    }
                                };

                                // Calculate required materials based on quantity
                                const materialItems: MaterialItem[] = (() => {
                                    if (!productRequirements || selectedQuantity <= 0) return [];
                                    const items: MaterialItem[] = [];

                                    // Add semi-finished product requirement
                                    if (productRequirements.semiFinished) {
                                        items.push({
                                            id: productRequirements.semiFinished.id,
                                            name: `نصف مصنع: ${productRequirements.semiFinished.name}`,
                                            unit: productRequirements.semiFinished.unit,
                                            requiredQty: Math.round(productRequirements.semiFinished.quantityPerUnit * selectedQuantity * 100) / 100,
                                            availableQty: productRequirements.semiFinished.availableStock
                                        });
                                    }

                                    // Add packaging materials
                                    productRequirements.packagingMaterials.forEach(pkg => {
                                        items.push({
                                            id: pkg.id,
                                            name: pkg.name,
                                            unit: pkg.unit,
                                            requiredQty: Math.round(pkg.quantityPerUnit * selectedQuantity * 100) / 100,
                                            availableQty: pkg.availableStock
                                        });
                                    });

                                    return items;
                                })();

                                return (
                                    <div key={field.id} className="space-y-3">
                                        <div className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-7 md:col-span-8">
                                                <FormField label="المنتج النهائي" className="space-y-1">
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
                                                        step="1"
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
                                                title={`متطلبات التعبئة (${products?.find(p => p.id.toString() === selectedProductId)?.name || ''})`}
                                                materials={materialItems}
                                                isLoading={isLoadingReq}
                                                className="mr-4"
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <Button type="button" variant="outline" size="sm" onClick={() => append({ finished_product_id: "", quantity: 0 })} className="w-full">
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
