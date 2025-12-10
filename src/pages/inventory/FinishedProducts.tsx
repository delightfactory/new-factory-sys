import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type FinishedProduct } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, RefreshCcw, Package2 } from "lucide-react";
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
import { useForm, useFieldArray } from "react-hook-form";
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

// Types for the form
type ProductFormValues = {
    code: string;
    name: string;
    unit: string;
    min_stock: number;
    unit_cost: number;
    quantity: number;
    sales_price: number;
    semi_finished_id: string; // Form uses string
    semi_finished_quantity: number;
    packaging: {
        packaging_material_id: string; // Form uses string
        quantity: number;
    }[];
};

export default function FinishedProducts() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const navigate = useNavigate();

    // Fetch Products
    const { data: products, isLoading } = useQuery({
        queryKey: ['finishedProducts'],
        queryFn: InventoryService.getFinishedProducts,
    });

    // Fetch Dependencies
    const { data: semiFinished } = useQuery({
        queryKey: ['semiFinishedProducts'],
        queryFn: InventoryService.getSemiFinishedProducts,
    });

    const { data: packagingMaterials } = useQuery({
        queryKey: ['packagingMaterials'],
        queryFn: InventoryService.getPackagingMaterials,
    });

    // Form Setup
    const form = useForm<ProductFormValues>({
        defaultValues: {
            code: '',
            name: '',
            unit: '',
            min_stock: 0,
            unit_cost: 0,
            quantity: 0,
            sales_price: 0,
            semi_finished_quantity: 1,
            packaging: [{ packaging_material_id: "", quantity: 0 }]
        }
    });

    const { fields, append, remove, replace } = useFieldArray({
        control: form.control,
        name: "packaging"
    });

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('finished_products', 'FP');
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
        mutationFn: async (data: ProductFormValues) => {
            const productData = {
                code: data.code,
                name: data.name,
                unit: data.unit,
                min_stock: data.min_stock,
                unit_cost: data.unit_cost,
                quantity: data.quantity,
                sales_price: data.sales_price,
                semi_finished_id: Number(data.semi_finished_id),
                semi_finished_quantity: data.semi_finished_quantity
            };
            const packagingData = data.packaging.map(pkg => ({
                packaging_material_id: Number(pkg.packaging_material_id),
                quantity: pkg.quantity
            }));
            return InventoryService.createFinishedProductWithPackaging(productData, packagingData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['finishedProducts'] });
            setIsOpen(false);
            toast.success("تم إضافة المنتج النهائي بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const updateMutation = useMutation({
        mutationFn: async (data: ProductFormValues) => {
            if (!editingId) throw new Error("No ID");
            const productData = {
                code: data.code,
                name: data.name,
                unit: data.unit,
                min_stock: data.min_stock,
                unit_cost: data.unit_cost,
                quantity: data.quantity,
                sales_price: data.sales_price,
                semi_finished_id: Number(data.semi_finished_id),
                semi_finished_quantity: data.semi_finished_quantity
            };
            const packagingData = data.packaging.map(pkg => ({
                packaging_material_id: Number(pkg.packaging_material_id),
                quantity: pkg.quantity
            }));
            return InventoryService.updateFinishedProductWithPackaging(editingId, productData, packagingData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['finishedProducts'] });
            setIsOpen(false);
            toast.success("تم تحديث المنتج النهائي بنجاح");
            form.reset();
            setIsEditMode(false);
            setEditingId(null);
        },
        onError: (error) => toast.error("حدث خطأ في التحديث: " + error.message)
    });

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteFinishedProduct,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['finishedProducts'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: ProductFormValues) => {
        if (isEditMode) {
            updateMutation.mutate(data);
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = async (item: FinishedProduct) => {
        setEditingId(item.id);
        setIsEditMode(true);
        form.reset({
            code: item.code,
            name: item.name,
            unit: item.unit,
            min_stock: item.min_stock || 0,
            unit_cost: item.unit_cost || 0,
            quantity: item.quantity || 0,
            sales_price: item.sales_price || 0,
            semi_finished_id: String(item.semi_finished_id),
            semi_finished_quantity: item.semi_finished_quantity,
            packaging: []
        });
        setIsOpen(true);

        try {
            const packaging = await InventoryService.getFinishedProductPackaging(item.id);
            if (packaging) {
                replace(packaging.map((pkg: any) => ({
                    packaging_material_id: String(pkg.packaging_material_id),
                    quantity: pkg.quantity
                })));
            }
        } catch (e) {
            console.error(e);
            toast.error("فشل تحميل بيانات التعبئة");
        }
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
            quantity: 0,
            sales_price: 0,
            semi_finished_quantity: 1,
            packaging: [{ packaging_material_id: "", quantity: 0 }]
        });
        setIsOpen(true);
    };

    const columns: ColumnDef<FinishedProduct>[] = [
        { accessorKey: "code", header: "الكود" },
        { accessorKey: "name", header: "الاسم" },
        { accessorKey: "quantity", header: "الكمية" },
        { accessorKey: "unit", header: "الوحدة" },
        {
            accessorKey: "unit_cost",
            header: "التكلفة",
            cell: ({ row }) => <span>{Number(row.getValue("unit_cost")).toFixed(2)} ج.م</span>
        },
        {
            accessorKey: "sales_price",
            header: "سعر البيع",
            cell: ({ row }) => <span>{Number(row.getValue("sales_price")).toFixed(2)} ج.م</span>
        },
        {
            id: "actions",
            header: "إجراءات",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
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
            <CardGridSkeleton count={4} />
        </div>
    );

    return (
        <div className="space-y-6">
            <PageHeader
                title="المنتجات النهائية"
                description="المنتجات الجاهزة للبيع ومواصفات تعبئتها"
                icon={Package2}
                actions={
                    <Button onClick={handleAddNew}>
                        <Plus className="mr-2 h-4 w-4" /> منتج نهائي جديد
                    </Button>
                }
            />

            {products && products.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={products}
                    onRowClick={(item) => navigate(`/inventory/finished/${item.id}`)}
                />
            ) : (
                <EmptyState
                    icon={Package2}
                    title="لا توجد منتجات نهائية"
                    description="ابدأ بإضافة أول منتج نهائي"
                    action={
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> منتج نهائي جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل المنتج النهائي" : "تعريف منتج نهائي"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل مواصفات المنتج النهائي ومواد التعبئة." : "أدخل مواصفات المنتج النهائي الجديد ومواد التعبئة اللازمة."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Product Info */}
                        {/* Product Info */}
                        <FormGrid className="border-b pb-4">
                            <FormField label="الكود" required error={form.formState.errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="FP-001" readOnly={isEditMode} />
                                    {!isEditMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={fetchNextCode} title="تحديث الكود">
                                            <RefreshCcw className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </FormField>
                            <FormField label="الاسم" required error={form.formState.errors.name?.message}>
                                <Input {...form.register("name", { required: "مطلوب" })} placeholder="مثال: صابون سائل 1 لتر" />
                            </FormField>
                            <FormField label="الوحدة" required error={form.formState.errors.unit?.message}>
                                <Input {...form.register("unit", { required: "مطلوب" })} placeholder="كرتونة / قطعة" />
                            </FormField>
                            <FormField label="سعر البيع" error={form.formState.errors.sales_price?.message}>
                                <Input type="number" step="0.01" {...form.register("sales_price", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="الكمية الحالية">
                                <Input type="number" step="0.01" {...form.register("quantity", { valueAsNumber: true })} disabled={isEditMode} />
                            </FormField>
                        </FormGrid>

                        {/* Composition */}
                        <div className="space-y-4 border-b pb-4">
                            <h3 className="text-lg font-medium">التكوين الأساسي</h3>
                            <FormGrid>
                                <FormField label="المنتج النصف مصنع (الأساس)" error={form.formState.errors.semi_finished_id?.message}>
                                    <SearchableSelect
                                        options={semiFinished?.map(item => ({
                                            value: item.id.toString(),
                                            label: item.name,
                                            description: item.unit
                                        })) || []}
                                        value={form.watch("semi_finished_id")?.toString()}
                                        onValueChange={(val) => form.setValue("semi_finished_id", val, { shouldValidate: true })}
                                        placeholder="اختر منتج نصف مصنع..."
                                        searchPlaceholder="ابحث عن منتج..."
                                    />
                                </FormField>
                                <FormField label="الكمية المطلوبة (لكل وحدة نهائية)" required error={form.formState.errors.semi_finished_quantity?.message}>
                                    <Input type="number" step="0.01" {...form.register("semi_finished_quantity", { valueAsNumber: true, required: "مطلوب" })} />
                                </FormField>
                            </FormGrid>
                        </div>

                        {/* Packaging */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium">مواد التعبئة والتغليف اللازمة</h3>
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => {
                                        const values = form.getValues();
                                        let totalCost = 0;

                                        // Semi-Finished Cost
                                        const sf = semiFinished?.find(s => s.id === Number(values.semi_finished_id));
                                        if (sf) {
                                            totalCost += (sf.unit_cost || 0) * (values.semi_finished_quantity || 0);
                                        }

                                        // Packaging Cost
                                        values.packaging.forEach(pkg => {
                                            const pm = packagingMaterials?.find(p => p.id === Number(pkg.packaging_material_id));
                                            if (pm) {
                                                totalCost += (pm.unit_cost || 0) * (pkg.quantity || 0);
                                            }
                                        });

                                        form.setValue("unit_cost", parseFloat(totalCost.toFixed(2)));
                                        toast.success(`تم حساب التكلفة الإجمالية: ${totalCost.toFixed(2)} ج.م`);
                                    }} title="حساب التكلفة بناءً على المكونات والتعبئة">
                                        حساب التكلفة
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => append({ packaging_material_id: "", quantity: 0 })}>
                                        <Plus className="h-4 w-4 mr-1" /> إضافة مادة
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <FormField label="مادة التعبئة" className="mb-0" error={form.formState.errors.packaging?.[index]?.packaging_material_id?.message}>
                                                <SearchableSelect
                                                    options={packagingMaterials?.map(pm => ({
                                                        value: pm.id.toString(),
                                                        label: pm.name,
                                                        description: pm.unit
                                                    })) || []}
                                                    value={form.watch(`packaging.${index}.packaging_material_id`)}
                                                    onValueChange={(val) => form.setValue(`packaging.${index}.packaging_material_id`, val, { shouldValidate: true })}
                                                    placeholder="اختر مادة..."
                                                    searchPlaceholder="ابحث عن مادة..."
                                                />
                                            </FormField>
                                        </div>
                                        <div className="w-24">
                                            <FormField label="الكمية" className="mb-0" error={form.formState.errors.packaging?.[index]?.quantity?.message}>
                                                <Input
                                                    type="number"
                                                    step="0.001"
                                                    {...form.register(`packaging.${index}.quantity` as const, { valueAsNumber: true, required: "مطلوب" })}
                                                />
                                            </FormField>
                                        </div>
                                        <div className="pb-2">
                                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t">
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : "حفظ المنتج"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
