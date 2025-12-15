import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type RawMaterial } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, RefreshCcw, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function RawMaterials() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const navigate = useNavigate();

    // Fetch Data
    const { data: rawMaterials, isLoading } = useQuery({
        queryKey: ['rawMaterials'],
        queryFn: InventoryService.getRawMaterials,
    });

    const form = useForm<RawMaterial>({
        defaultValues: {
            code: '',
            name: '',
            unit: '',
            min_stock: 0,
            unit_cost: 0,
            sales_price: 0,
            quantity: 0
        }
    });
    const { formState: { errors } } = form;

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('raw_materials', 'RM');
            form.setValue('code', code);
        } catch (error) {
            console.error("Failed to fetch next code", error);
        }
    };

    useEffect(() => {
        if (isOpen && !isEditMode) {
            fetchNextCode();
        }
    }, [isOpen, isEditMode]);

    // Mutations
    const createMutation = useMutation({
        mutationFn: InventoryService.createRawMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
            setIsOpen(false);
            toast.success("تم إضافة المادة الخام بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const updateMutation = useMutation({
        mutationFn: (data: RawMaterial) => InventoryService.updateRawMaterial(data.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
            setIsOpen(false);
            toast.success("تم تحديث المادة بنجاح");
            form.reset();
            setIsEditMode(false);
            setEditingId(null);
        },
        onError: (error) => toast.error("حدث خطأ في التحديث: " + error.message)
    });

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteRawMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: RawMaterial) => {
        if (isEditMode && editingId) {
            updateMutation.mutate({ ...data, id: editingId });
        } else {
            // Remove ID for creation
            const { id, created_at, updated_at, ...createData } = data;
            createMutation.mutate(createData as any);
        }
    };

    const handlEdit = (item: RawMaterial) => {
        setEditingId(item.id);
        setIsEditMode(true);
        // Format numbers for form display
        const formItem = {
            ...item,
            quantity: item.quantity ? Number(Number(item.quantity).toFixed(2)) : 0,
            unit_cost: item.unit_cost ? Number(Number(item.unit_cost).toFixed(2)) : 0,
            sales_price: item.sales_price ? Number(Number(item.sales_price).toFixed(2)) : 0,
            min_stock: item.min_stock ? Number(Number(item.min_stock).toFixed(2)) : 0,
        };
        form.reset(formItem);
        setIsOpen(true);
    };

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id);
    };

    const handleAddNew = () => {
        setIsEditMode(false);
        setEditingId(null);
        form.reset({
            code: '',
            name: '',
            unit: '',
            min_stock: 0,
            unit_cost: 0,
            sales_price: 0,
            quantity: 0
        });
        setIsOpen(true);
    };

    const columns: ColumnDef<RawMaterial>[] = [
        { accessorKey: "code", header: "الكود" },
        { accessorKey: "name", header: "الاسم" },
        {
            accessorKey: "quantity",
            header: "الكمية الحالية",
            cell: ({ row }) => <span dir="ltr">{formatNumber(row.getValue("quantity"))}</span>
        },
        { accessorKey: "unit", header: "الوحدة" },
        {
            accessorKey: "unit_cost",
            header: "سعر الوحدة",
            cell: ({ row }) => <span>{formatCurrency(row.getValue("unit_cost"))}</span>
        },
        { accessorKey: "min_stock", header: "حد الأمان" },
        {
            id: "actions",
            header: "إجراءات",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handlEdit(item); }}>
                            <Pencil className="h-4 w-4 text-blue-500" />
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        سيتم حذف "{item.name}" نهائياً. لا يمكن التراجع عن هذا الإجراء.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        حذف
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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

    return (
        <div className="space-y-6">
            <PageHeader
                title="المواد الخام"
                description="إدارة مخزون المواد الخام ومتابعة الكميات"
                icon={Package}
                actions={
                    <Button onClick={handleAddNew}>
                        <Plus className="mr-2 h-4 w-4" /> إضافة مادة خام
                    </Button>
                }
            />

            {rawMaterials && rawMaterials.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={rawMaterials}
                    onRowClick={(item) => navigate(`/inventory/raw-materials/${item.id}`)}
                />
            ) : (
                <EmptyState
                    icon={Package}
                    title="لا توجد مواد خام"
                    description="ابدأ بإضافة أول مادة خام إلى المخزون"
                    action={
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> إضافة مادة خام
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل مادة خام" : "إضافة مادة خام جديدة"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل بيانات المادة الخام الحالية." : "أدخل بيانات المادة الخام الجديدة لإضافتها للمخزون."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormGrid className="grid-cols-1 md:grid-cols-2">
                            <FormField label="الكود" required error={errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="RM-001" readOnly={isEditMode} />
                                    {!isEditMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={fetchNextCode} title="تحديث الكود">
                                            <RefreshCcw className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </FormField>
                            <FormField label="الاسم" required error={errors.name?.message}>
                                <Input {...form.register("name", { required: "مطلوب" })} placeholder="اسم المادة" />
                            </FormField>
                            <FormField label="الوحدة" required error={errors.unit?.message}>
                                <Input {...form.register("unit", { required: "مطلوب" })} placeholder="كجم / لتر / قطعة" />
                            </FormField>
                            <FormField label="حد الأمان" error={errors.min_stock?.message}>
                                <Input type="number" step="0.01" {...form.register("min_stock", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="سعر الوحدة (التكلفة)" error={errors.unit_cost?.message}>
                                <Input type="number" step="0.01" {...form.register("unit_cost", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="سعر البيع" error={errors.sales_price?.message}>
                                <Input type="number" step="0.01" {...form.register("sales_price", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="الكمية الحالية" error={errors.quantity?.message}>
                                <Input type="number" step="0.01" {...form.register("quantity", { valueAsNumber: true })} disabled={isEditMode} />
                                {isEditMode && <p className="text-xs text-muted-foreground mt-1">تعديل الكمية يتم عبر التسويات أو الأوامر.</p>}
                            </FormField>
                        </FormGrid>
                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
