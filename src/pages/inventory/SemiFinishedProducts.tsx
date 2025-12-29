import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type SemiFinishedProduct } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, RefreshCcw, Calculator, Beaker } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { FormField, FormGrid } from "@/components/ui/form-field";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
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
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";

// Types for the form
type RecipeFormValues = {
    code: string;
    name: string;
    unit: string;
    min_stock: number;
    unit_cost: number;
    quantity: number;
    sales_price: number;
    recipe_batch_size: number;
    ingredients: {
        raw_material_id: string;
        quantity: number;
        percentage?: number; // Calculated
    }[];
};

export default function SemiFinishedProducts() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const navigate = useNavigate();

    // Fetch Products
    const { data: products, isLoading } = useQuery({
        queryKey: ['semiFinishedProducts'],
        queryFn: InventoryService.getSemiFinishedProducts,
    });

    // Fetch Raw Materials
    const { data: rawMaterials } = useQuery({
        queryKey: ['rawMaterials'],
        queryFn: InventoryService.getRawMaterials,
    });

    // Form Setup
    const form = useForm<RecipeFormValues>({
        defaultValues: {
            code: '',
            name: '',
            unit: '',
            min_stock: 0,
            unit_cost: 0,
            quantity: 0,
            sales_price: 0,
            recipe_batch_size: 100,
            ingredients: [{ raw_material_id: "", quantity: 0 }]
        }
    });

    const { fields, append, remove, replace } = useFieldArray({
        control: form.control,
        name: "ingredients"
    });

    // Real-time Calculation
    const watchedBatchSize = useWatch({ control: form.control, name: "recipe_batch_size" }) || 100;
    const watchedIngredients = useWatch({ control: form.control, name: "ingredients" });

    // Calculate Costs & Percentages
    const calculateStats = () => {
        let totalCost = 0;
        let totalWeight = 0;

        watchedIngredients?.forEach(ing => {
            const rm = rawMaterials?.find(r => r.id === Number(ing.raw_material_id));
            if (rm) {
                totalCost += (rm.unit_cost || 0) * (ing.quantity || 0);
                totalWeight += (ing.quantity || 0);
            }
        });

        // Unit Cost = Total Batch Cost / Batch Size
        const estimatedUnitCost = watchedBatchSize > 0 ? (totalCost / watchedBatchSize) : 0;

        return { totalCost, totalWeight, estimatedUnitCost };
    };

    const { totalCost, estimatedUnitCost } = calculateStats();

    // Fetch Next Code
    const fetchNextCode = async () => {
        try {
            const code = await InventoryService.getNextCode('semi_finished_products', 'SF');
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
        mutationFn: async (data: RecipeFormValues) => {
            const productData = {
                code: data.code,
                name: data.name,
                unit: data.unit,
                min_stock: data.min_stock,
                unit_cost: data.unit_cost,
                quantity: data.quantity,
                sales_price: data.sales_price,
                recipe_batch_size: data.recipe_batch_size
            };
            const ingredientsData = data.ingredients.map(ing => ({
                raw_material_id: Number(ing.raw_material_id),
                quantity: ing.quantity,
                percentage: (ing.quantity / data.recipe_batch_size) * 100
            }));
            return InventoryService.createSemiFinishedProductWithRecipe(productData, ingredientsData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['semiFinishedProducts'] });
            setIsOpen(false);
            toast.success("تم إضافة المنتج والوصفة بنجاح");
            form.reset();
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const updateMutation = useMutation({
        mutationFn: async (data: RecipeFormValues) => {
            if (!editingId) throw new Error("No ID");
            const productData = {
                code: data.code,
                name: data.name,
                unit: data.unit,
                min_stock: data.min_stock,
                unit_cost: data.unit_cost,
                quantity: data.quantity,
                sales_price: data.sales_price,
                recipe_batch_size: data.recipe_batch_size
            };
            const ingredientsData = data.ingredients.map(ing => ({
                raw_material_id: Number(ing.raw_material_id),
                quantity: ing.quantity,
                percentage: (ing.quantity / data.recipe_batch_size) * 100
            }));
            return InventoryService.updateSemiFinishedProductWithRecipe(editingId, productData, ingredientsData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['semiFinishedProducts'] });
            setIsOpen(false);
            toast.success("تم تحديث المنتج والوصفة بنجاح");
            form.reset();
            setIsEditMode(false);
            setEditingId(null);
        },
        onError: (error) => toast.error("حدث خطأ في التحديث: " + error.message)
    });

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteSemiFinishedProduct,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['semiFinishedProducts'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: RecipeFormValues) => {
        if (isEditMode) {
            updateMutation.mutate(data);
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = async (item: SemiFinishedProduct) => {
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
            recipe_batch_size: item.recipe_batch_size || 100, // Default for old data
            ingredients: [] // Will load below
        });
        setIsOpen(true);

        try {
            const ingredients = await InventoryService.getSemiFinishedIngredients(item.id);
            if (ingredients) {
                replace(ingredients.map((ing: any) => ({
                    raw_material_id: String(ing.raw_material_id),
                    quantity: ing.quantity || (ing.percentage * (item.recipe_batch_size || 100) / 100) // Backwards compat
                })));
            }
        } catch (e) {
            console.error(e);
            toast.error("فشل تحميل الوصفة");
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
            recipe_batch_size: 100,
            ingredients: [{ raw_material_id: "", quantity: 0 }]
        });
        setIsOpen(true);
    };

    const columns: ColumnDef<SemiFinishedProduct>[] = [
        { accessorKey: "code", header: "الكود", enableSorting: true },
        { accessorKey: "name", header: "الاسم", enableSorting: true },
        { accessorKey: "quantity", header: "الكمية الحالية", enableSorting: true },
        { accessorKey: "unit", header: "الوحدة", enableSorting: true },
        {
            accessorKey: "unit_cost",
            header: "التكلفة التقريبية",
            enableSorting: true,
            cell: ({ row }) => <span>{formatCurrency(row.getValue("unit_cost"))}</span>
        },
        {
            id: "actions",
            header: "إجراءات",
            enableSorting: false,
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>
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
                                        سيتم حذف "{item.name}" نهائياً مع الوصفة الخاصة به (Batch Size: {item.recipe_batch_size || 100} {item.unit}).
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
                title="المنتجات النصف مصنعة والوصفات"
                description="إدارة المنتجات الوسيطة وتكوين وصفات الإنتاج"
                icon={Beaker}
                actions={
                    <Button onClick={handleAddNew}>
                        <Plus className="mr-2 h-4 w-4" /> منتج جديد / وصفة
                    </Button>
                }
            />

            {products && products.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={products}
                    onRowClick={(item) => navigate(`/inventory/semi-finished/${item.id}`)}
                />
            ) : (
                <EmptyState
                    icon={Beaker}
                    title="لا توجد منتجات نصف مصنعة"
                    description="ابدأ بإضافة منتج ووصفته"
                    action={
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> منتج جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل المنتج والوصفة" : "تعريف منتج نصف مصنع ووصفته"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل بيانات المنتج الحالي ومكونات الوصفة." : "إدخال بيانات منتج جديد ومكونات الوصفة الخاصة به."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Product Info */}
                        {/* Product Info */}
                        <FormGrid className="border-b pb-4">
                            <FormField label="الكود" required error={form.formState.errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="SF-001" readOnly={isEditMode} />
                                    {!isEditMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={fetchNextCode} title="تحديث الكود">
                                            <RefreshCcw className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </FormField>
                            <FormField label="الاسم" required error={form.formState.errors.name?.message}>
                                <Input {...form.register("name", { required: "مطلوب" })} placeholder="مثال: عجينة صابون" />
                            </FormField>
                            <FormField label="الوحدة (للانتاج)" required error={form.formState.errors.unit?.message}>
                                <Input {...form.register("unit", { required: "مطلوب" })} placeholder="كجم" />
                            </FormField>
                            <FormField label="حد الأمان" error={form.formState.errors.min_stock?.message}>
                                <Input type="number" step="0.01" {...form.register("min_stock", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="سعر البيع" error={form.formState.errors.sales_price?.message}>
                                <Input type="number" step="0.01" {...form.register("sales_price", { valueAsNumber: true })} />
                            </FormField>
                        </FormGrid>

                        {/* Batch & Recipe Configuration */}
                        <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 space-y-4">
                            <div className="flex items-center gap-4 border-b pb-4">
                                <div className="flex-1 space-y-1">
                                    <label className="text-sm font-bold text-primary">حجم التشغيلة القياسي (Batch Size)</label>
                                    <p className="text-xs text-muted-foreground">أدخل الكمية التي تنتجها هذه الوصفة (مثلاً 100 كجم)</p>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            step="0.01"
                                            className="text-lg font-bold"
                                            {...form.register("recipe_batch_size", { valueAsNumber: true, required: true })}
                                        />
                                        <span className="text-sm font-medium">{form.watch("unit") || "وحدة"}</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white dark:bg-slate-800 p-3 rounded shadow-sm border">
                                    <div className="text-xs text-muted-foreground mb-1">متوسط تكلفة الوحدة المتوقع</div>
                                    <div className="text-2xl font-bold text-green-600">
                                        {formatCurrency(estimatedUnitCost)} <span className="text-sm font-normal">/ {form.watch("unit")}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 mt-1 w-full text-xs"
                                        onClick={() => form.setValue("unit_cost", parseFloat(estimatedUnitCost.toFixed(2)))}
                                    >
                                        <Calculator className="w-3 h-3 mr-1" /> اعتماد هذه التكلفة
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-base font-medium">مكونات الخلطة / التشغيلة</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => append({ raw_material_id: "", quantity: 0 })}>
                                        <Plus className="h-4 w-4 mr-1" /> إضافة مادة خام
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {fields.map((field, index) => {
                                        const quantity = watchedIngredients?.[index]?.quantity || 0;
                                        const percentage = watchedBatchSize > 0 ? (quantity / watchedBatchSize) * 100 : 0;

                                        return (
                                            <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                                                <div className="col-span-5">
                                                    <FormField label="المادة الخام" className="mb-0" error={form.formState.errors.ingredients?.[index]?.raw_material_id?.message}>
                                                        <SearchableSelect
                                                            options={rawMaterials?.map(rm => ({
                                                                value: rm.id.toString(),
                                                                label: rm.name,
                                                                description: `${rm.unit} - ${formatCurrency(rm.sales_price || 0)}`
                                                            })) || []}
                                                            value={form.watch(`ingredients.${index}.raw_material_id`)}
                                                            onValueChange={(val) => form.setValue(`ingredients.${index}.raw_material_id`, val, { shouldValidate: true })}
                                                            placeholder="اختر مادة..."
                                                            searchPlaceholder="ابحث عن مادة..."
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="col-span-3">
                                                    <FormField label="الكمية في التشغيلة" className="mb-0" error={form.formState.errors.ingredients?.[index]?.quantity?.message}>
                                                        <Input
                                                            type="number"
                                                            step="0.001"
                                                            {...form.register(`ingredients.${index}.quantity` as const, { valueAsNumber: true, required: "مطلوب" })}
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="col-span-3 pb-2">
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground block">النسبة المئوية</span>
                                                        <div className="h-10 px-3 py-2 bg-muted rounded text-sm flex items-center justify-between border">
                                                            <span>{formatNumber(percentage)}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-span-1 pb-2">
                                                    <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {watchedIngredients && watchedIngredients.length > 0 && (
                                    <Alert className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200">
                                        <AlertTitle>ملخص الوصفة</AlertTitle>
                                        <AlertDescription className="text-xs text-muted-foreground">
                                            إجمالي وزن المكونات: <span className="font-medium text-foreground">{formatNumber(watchedIngredients.reduce((acc, curr) => acc + (curr.quantity || 0), 0))} {form.watch("unit")}</span>
                                            {' '}-{' '}
                                            إجمالي التكلفة: <span className="font-medium text-foreground">{formatCurrency(totalCost)}</span>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t gap-3">
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>إلغاء</Button>
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : "حفظ المنتج والوصفة"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
