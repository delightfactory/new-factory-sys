import { semiRecipeCost } from '@/features/inventory/recipe-cost';
import { formatInventoryCost, formatInventoryQuantity } from "@/lib/inventory-format";
import { ReferenceReadNotice } from '@/components/inventory/ReferenceReadNotice';
import { referencePlaceholder } from '@/features/inventory/material-editor';
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
import { CatalogReadState } from "@/components/ui/catalog-read-state";
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
import { RecipeEditingService } from "@/services/RecipeEditingService";
import { useRecipeWorkspace } from "@/hooks/use-recipe-workspace";
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
    const navigate = useNavigate();

    // Fetch Products
    const catalog = useQuery({
        queryKey: ['semiFinishedProducts'],
        queryFn: InventoryService.getSemiFinishedProducts,
        retry: false,
    });
    const { data: products } = catalog;

    // Fetch Raw Materials
    const rawQuery = useQuery({
        queryKey: ['rawMaterials'],
        queryFn: InventoryService.getRawMaterials,
    });
    const { data: rawMaterials } = rawQuery;

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

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "ingredients"
    });

    // Real-time Calculation
    const watchedBatchSize = useWatch({ control: form.control, name: "recipe_batch_size" }) ?? 100;
    const watchedIngredients = useWatch({ control: form.control, name: "ingredients" });

    const { totalCost, unitCost: estimatedUnitCost } = semiRecipeCost(
        watchedIngredients.map(ing => ({ materialId: ing.raw_material_id, quantity: ing.quantity })), rawMaterials, watchedBatchSize);
    const canCalculateCost = estimatedUnitCost !== null;

    const workspace = useRecipeWorkspace<RecipeFormValues>({
        dirty: form.formState.isDirty,
        reset: values => form.reset(values),
        load: async id => { const { product, ingredients } = await RecipeEditingService.semi(id);
            const batch = product.recipe_batch_size ?? 100;
            const legacy = ingredients.some(ing => ing.quantity === 0 && ing.percentage > 0);
            return { values: { ...product, recipe_batch_size: batch,
                ingredients: ingredients.map(ing => ({ raw_material_id: String(ing.raw_material_id),
                    quantity: ing.quantity === 0 && ing.percentage > 0 ? ing.percentage * batch / 100 : ing.quantity })) },
                hasRecipe: ingredients.length > 0, legacy }; },
        save: async (data, id, overrideCost) => { const productData = { code: data.code, name: data.name, unit: data.unit, min_stock: data.min_stock,
                sales_price: data.sales_price, recipe_batch_size: data.recipe_batch_size,
                ...(id === null ? { quantity: data.quantity, unit_cost: data.unit_cost } : overrideCost ? { unit_cost: data.unit_cost } : {}) };
            const ingredients = data.ingredients.map(ing => ({ raw_material_id: Number(ing.raw_material_id),
                quantity: ing.quantity, percentage: ing.quantity / data.recipe_batch_size * 100 }));
            return id === null ? InventoryService.createSemiFinishedProductWithRecipe(productData as SemiFinishedProduct, ingredients)
                : InventoryService.updateSemiFinishedProductWithRecipe(id, productData, ingredients); },
        isEmpty: values => values.ingredients.length === 0,
        afterSave: () => {
            for (const key of ['semiFinishedProducts', 'finishedProducts', 'item', 'item-ingredients', 'finished-packaging', 'base-semi', 'used-in',
                'report-inventory-valuation', 'product-cost-cards', 'report-low-stock-comprehensive', 'dashboard-stats', 'dashboard-balance-sheet', 'financial-balance-sheet', 'productionOrderItems', 'packagingOrderItems']) {
                void queryClient.invalidateQueries({ queryKey: [key] });
            }
        },
    });
    const isOpen = workspace.open, isEditMode = workspace.id !== null;
    const fetchNextCode = async () => {
        const entry = workspace.currentGeneration(), previous = form.getValues('code');
        try {
            const code = await InventoryService.getNextCode('semi_finished_products', 'SF');
            if (entry === workspace.currentGeneration() && form.getValues('code') === previous) form.setValue('code', code);
        } catch { toast.error('تعذر اقتراح الكود. يمكنك إدخاله يدويًا أو إعادة المحاولة.'); }
    };

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteSemiFinishedProduct,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['semiFinishedProducts'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: RecipeFormValues) => {
        let valid = true;
        data.ingredients.forEach((row, index) => {
            if (!Number.isSafeInteger(Number(row.raw_material_id)) || Number(row.raw_material_id) <= 0) {
                form.setError(`ingredients.${index}.raw_material_id`, { message: 'اختر المادة' }); valid = false;
            }
            if (!Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1e9) {
                form.setError(`ingredients.${index}.quantity`, { message: 'أدخل كمية موجبة لا تتجاوز مليارًا' }); valid = false;
            }
        });
        if (!Number.isFinite(data.recipe_batch_size) || data.recipe_batch_size <= 0) { form.setError('recipe_batch_size', { message: 'أدخل حجم تشغيلة موجبًا' }); valid = false; }
        if (valid) void workspace.submit(data);
    };

    const handleEdit = (item: SemiFinishedProduct) => workspace.edit(item.id);

    const handleDelete = (id: number) => {
        deleteMutation.mutate(id);
    };

    const handleAddNew = () => {
        workspace.create({
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
        void fetchNextCode();
    };

    const columns: ColumnDef<SemiFinishedProduct>[] = [
        { accessorKey: "code", header: "الكود", enableSorting: true },
        { accessorKey: "name", header: "الاسم", enableSorting: true },
        { accessorKey: "quantity", header: "الكمية الحالية", enableSorting: true, cell: ({ row }) => <span dir="ltr">{formatInventoryQuantity(row.getValue("quantity"))}</span> },
        { accessorKey: "unit", header: "الوحدة", enableSorting: true },
        {
            accessorKey: "unit_cost",
            header: "التكلفة التقريبية",
            enableSorting: true,
            cell: ({ row }) => <span>{formatInventoryCost(row.getValue("unit_cost"))}</span>
        },
        {
            id: "actions",
            header: "إجراءات",
            enableSorting: false,
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end" onClick={event => event.stopPropagation()}>
                        <Button aria-label={`تعديل ${item.name}`} variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>
                            <Pencil className="h-4 w-4 text-blue-500" />
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button aria-label={`حذف ${item.name}`} variant="ghost" size="icon">
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

    return (
        <div className="space-y-6">
            <PageHeader
                title="المنتجات النصف مصنعة والوصفات"
                description="إدارة المنتجات الوسيطة وتكوين وصفات الإنتاج"
                icon={Beaker}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>تحديث القائمة</Button>
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> منتج جديد / وصفة
                        </Button>
                    </div>
                }
            />

            <CatalogReadState query={catalog} entity="قائمة نصف المصنع" onRetry={() => void catalog.refetch()}>
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

            </CatalogReadState>

            <Dialog open={isOpen} onOpenChange={open => { if (!open) void workspace.close(); }}>
                <DialogContent task className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل المنتج والوصفة" : "تعريف منتج نصف مصنع ووصفته"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل بيانات المنتج الحالي ومكونات الوصفة." : "إدخال بيانات منتج جديد ومكونات الوصفة الخاصة به."}
                        </DialogDescription>
                    </DialogHeader>
                    {workspace.state === 'loading' && <p role="status">جارٍ تحميل المنتج والوصفة…</p>}
                    {workspace.state === 'error' && <div role="alert" className="space-y-3"><p>تعذر تحميل الوصفة. لم نعرض وصفة فارغة، والحفظ غير متاح.</p><Button onClick={() => workspace.id !== null && void workspace.edit(workspace.id)}>إعادة المحاولة</Button></div>}
                    {workspace.state === 'ready' && <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <ReferenceReadNotice query={rawQuery} label="المواد الخام" selectedValues={form.watch('ingredients').map(item => item.raw_material_id)} retry={() => void rawQuery.refetch()} />
                        <fieldset disabled={workspace.locked} className="space-y-6 min-w-0">
                        {isEditMode && <p className="text-sm text-muted-foreground">آخر حفظ هو المعتمد عند التعديل من أكثر من مستخدم. حفظ البيانات والوصفة لا يغيّر رصيد المخزون.</p>}
                        {workspace.legacy && <p role="status">بعض كميات الوصفة محوّلة من نسب قديمة؛ ستُحفظ ككميات عند الحفظ.</p>}
                        {workspace.overrideCost && <p role="status" className="text-sm text-amber-700">سيُستبدل متوسط تكلفة الوحدة بالتكلفة المعتمدة: {formatInventoryCost(form.watch("unit_cost"))}</p>}
                        {/* Product Info */}
                        <FormGrid className="border-b pb-4">
                            <FormField label="الكود" required error={form.formState.errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="SF-001" readOnly={isEditMode} />
                                    {!isEditMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={() => void fetchNextCode()} title="تحديث الكود" aria-label="اقتراح كود جديد">
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
                                <Input type="number" step="any" {...form.register("min_stock", { valueAsNumber: true })} />
                            </FormField>
                            <FormField label="سعر البيع" error={form.formState.errors.sales_price?.message}>
                                <Input type="number" step="any" {...form.register("sales_price", { valueAsNumber: true })} />
                            </FormField>
                        </FormGrid>

                        {/* Batch & Recipe Configuration */}
                        <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 space-y-4">
                            <div className="flex flex-col sm:flex-row items-stretch gap-4 border-b pb-4">
                                <div className="flex-1 space-y-1">
                                    <label className="text-sm font-bold text-primary">حجم التشغيلة القياسي (Batch Size)</label>
                                    <p className="text-xs text-muted-foreground">أدخل الكمية التي تنتجها هذه الوصفة (مثلاً 100 كجم)</p>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            step="any"
                                            className="text-lg font-bold"
                                            {...form.register("recipe_batch_size", { valueAsNumber: true, required: "مطلوب", min: { value: 0.000000001, message: "أدخل حجم تشغيلة موجبًا" } })}
                                        />
                                        <span className="text-sm font-medium">{form.watch("unit") || "وحدة"}</span>
                                    </div>
                                </div>
                                <div className="flex-1 bg-white dark:bg-slate-800 p-3 rounded shadow-sm border">
                                    <div className="text-xs text-muted-foreground mb-1">متوسط تكلفة الوحدة المتوقع</div>
                                    <div className="text-2xl font-bold text-green-600">
                                        {estimatedUnitCost === null ? 'غير متاح؛ راجع المكونات والكميات' : formatInventoryCost(estimatedUnitCost)} <span className="text-sm font-normal">/ {form.watch("unit")}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 mt-1 w-full text-xs"
                                        disabled={!canCalculateCost} onClick={() => { form.setValue("unit_cost", estimatedUnitCost!, { shouldDirty: true }); workspace.setOverrideCost(true); }}
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
                                                <div className="col-span-12 sm:col-span-5">
                                                    <FormField label="المادة الخام" className="mb-0" error={form.formState.errors.ingredients?.[index]?.raw_material_id?.message}>
                                                        <SearchableSelect
                                                            ariaLabel={`المادة الخام ${index + 1}`} options={rawMaterials?.map(rm => ({
                                                                value: rm.id.toString(),
                                                                label: rm.name,
                                                                description: `${rm.unit} - ${formatCurrency(rm.sales_price || 0)}`
                                                            })) || []}
                                                            value={form.watch(`ingredients.${index}.raw_material_id`)}
                                                            onValueChange={(val) => form.setValue(`ingredients.${index}.raw_material_id`, val, { shouldValidate: true, shouldDirty: true })}
                                                            disabled={!rawMaterials}
                                                            placeholder={referencePlaceholder(form.watch(`ingredients.${index}.raw_material_id`), rawMaterials, 'اختر مادة...')}
                                                            searchPlaceholder="ابحث عن مادة..."
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="col-span-6 sm:col-span-3">
                                                    <FormField label="الكمية في التشغيلة" className="mb-0" error={form.formState.errors.ingredients?.[index]?.quantity?.message}>
                                                        <Input
                                                            type="number"
                                                            step="any" aria-label={`كمية المكوّن ${index + 1}`}
                                                            {...form.register(`ingredients.${index}.quantity` as const, { valueAsNumber: true, required: "مطلوب" })}
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="col-span-4 sm:col-span-3 pb-2">
                                                    <div className="space-y-1">
                                                        <span className="text-xs text-muted-foreground block">النسبة المئوية</span>
                                                        <div className="h-10 px-3 py-2 bg-muted rounded text-sm flex items-center justify-between border">
                                                            <span>{formatNumber(percentage)}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-span-2 sm:col-span-1 pb-2">
                                                    <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" aria-label={`حذف المكوّن ${index + 1}`} onClick={() => remove(index)}>
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
                                            إجمالي التكلفة: <span className="font-medium text-foreground">{totalCost === null ? 'غير متاح؛ قائمة المكونات غير مكتملة' : formatInventoryCost(totalCost)}</span>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>

                        </fieldset>
                        <div className="sticky bottom-0 bg-background flex flex-wrap justify-end py-4 border-t gap-3">
                            <Button type="button" variant="outline" onClick={() => void workspace.close()}>إلغاء</Button>
                            <Button type="submit" disabled={workspace.locked}>
                                {workspace.saving ? "جاري الحفظ..." : "حفظ المنتج والوصفة"}
                            </Button>
                        </div>
                        {workspace.uncertain && <div role="alert" className="space-y-3"><p>تعذر تأكيد الحفظ. البيانات مقفلة لحين التحقق؛ أعد الحفظ بنفس البيانات لمنع التكرار. لا تغلق الصفحة.</p><Button type="button" disabled={workspace.saving} onClick={() => void workspace.retrySave()}>إعادة الحفظ بنفس البيانات</Button></div>}
                    </form>}
                </DialogContent>
            </Dialog>
            {workspace.confirmations.map((confirmation, index) => <span key={index}>{confirmation}</span>)}
        </div>
    );
}
