import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type PackagingMaterial } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, RefreshCcw, Box } from "lucide-react";
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
} from "@/components/ui/alert-dialog"

export default function PackagingMaterials() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Fetch Data
    const { data: packagingMaterials, isLoading } = useQuery({
        queryKey: ['packagingMaterials'],
        queryFn: InventoryService.getPackagingMaterials,
    });

    const form = useForm<PackagingMaterial>({
        defaultValues: {
            code: '',
            name: '',
            unit: '',
            min_stock: 0,
            unit_cost: 0,
            quantity: 0
        }
    });
    const { formState: { errors } } = form;

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('packaging_materials', 'PM');
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
        mutationFn: InventoryService.createPackagingMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingMaterials'] });
            setIsOpen(false);
            toast.success("تم إضافة مادة التعبئة بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const updateMutation = useMutation({
        mutationFn: (data: PackagingMaterial) => InventoryService.updatePackagingMaterial(data.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingMaterials'] });
            setIsOpen(false);
            toast.success("تم تحديث المادة بنجاح");
            form.reset();
            setIsEditMode(false);
            setEditingId(null);
        },
        onError: (error) => toast.error("حدث خطأ في التحديث: " + error.message)
    });

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deletePackagingMaterial,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['packagingMaterials'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: PackagingMaterial) => {
        if (isEditMode && editingId) {
            updateMutation.mutate({ ...data, id: editingId });
        } else {
            const { id, created_at, updated_at, ...createData } = data;
            createMutation.mutate(createData as any);
        }
    };

    const handlEdit = (item: PackagingMaterial) => {
        setEditingId(item.id);
        setIsEditMode(true);
        form.reset(item);
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
            quantity: 0
        });
        setIsOpen(true);
    };

    const columns: ColumnDef<PackagingMaterial>[] = [
        { accessorKey: "code", header: "الكود" },
        { accessorKey: "name", header: "الاسم" },
        { accessorKey: "quantity", header: "الكمية الحالية" },
        { accessorKey: "unit", header: "الوحدة" },
        {
            accessorKey: "unit_cost",
            header: "سعر الوحدة",
            cell: ({ row }) => <span>{Number(row.getValue("unit_cost")).toFixed(2)} ج.م</span>
        },
        { accessorKey: "min_stock", header: "حد الأمان" },
        {
            id: "actions",
            header: "إجراءات",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handlEdit(item)}>
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
                                        سيتم حذف "{item.name}" نهائياً.
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
                title="مواد التعبئة والتغليف"
                description="إدارة مخزون مواد التعبئة كالعبوات والكراتين"
                icon={Box}
                actions={
                    <Button onClick={handleAddNew}>
                        <Plus className="mr-2 h-4 w-4" /> إضافة مادة تعبئة
                    </Button>
                }
            />

            {packagingMaterials && packagingMaterials.length > 0 ? (
                <DataTable columns={columns} data={packagingMaterials} />
            ) : (
                <EmptyState
                    icon={Box}
                    title="لا توجد مواد تعبئة"
                    description="ابدأ بإضافة أول مادة تعبئة إلى المخزون"
                    action={
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> إضافة مادة تعبئة
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل مادة تعبئة" : "إضافة مادة تعبئة جديدة"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل بيانات مادة التعبئة الحالية." : "أدخل بيانات مادة التعبئة الجديدة."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormGrid className="grid-cols-1 md:grid-cols-2">
                            <FormField label="الكود" required error={errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="PM-001" readOnly={isEditMode} />
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
                                <Input {...form.register("unit", { required: "مطلوب" })} placeholder="قطعة / كجم" />
                            </FormField>
                            <FormField label="حد الأمان" error={errors.min_stock?.message}>
                                <Input type="number" step="0.01" {...form.register("min_stock", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="سعر الوحدة" error={errors.unit_cost?.message}>
                                <Input type="number" step="0.01" {...form.register("unit_cost", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="الكمية الحالية" error={errors.quantity?.message}>
                                <Input type="number" step="0.01" {...form.register("quantity", { valueAsNumber: true })} disabled={isEditMode} />
                                {isEditMode && <p className="text-xs text-muted-foreground mt-1">تعديل الكمية يتم عبر التسويات.</p>}
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
