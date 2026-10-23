import { FormNumberInput } from '@/components/ui/number-input';
import { finishedRecipeCost } from '@/features/inventory/recipe-cost';
import { formatInventoryCost, formatInventoryQuantity } from "@/lib/inventory-format";
import { ReferenceReadNotice } from '@/components/inventory/ReferenceReadNotice';
import { referencePlaceholder } from '@/features/inventory/material-editor';
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type FinishedProduct } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, RefreshCcw, Package2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CatalogReadState } from "@/components/ui/catalog-read-state";
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
    const navigate = useNavigate();

    // Fetch Products
    const catalog = useQuery({
        queryKey: ['finishedProducts'],
        queryFn: InventoryService.getFinishedProducts,
        retry: false,
    });
    const { data: products } = catalog;

    // Fetch Dependencies
    const semiQuery = useQuery({
        queryKey: ['semiFinishedProducts'],
        queryFn: InventoryService.getSemiFinishedProducts,
    });
    const { data: semiFinished } = semiQuery;

    const packagingQuery = useQuery({
        queryKey: ['packagingMaterials'],
        queryFn: InventoryService.getPackagingMaterials,
    });
    const { data: packagingMaterials } = packagingQuery;

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
            semi_finished_id: '',
            semi_finished_quantity: 1,
            packaging: [{ packaging_material_id: "", quantity: 0 }]
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "packaging"
    });

    const workspace = useRecipeWorkspace<ProductFormValues>({
        dirty: form.formState.isDirty,
        reset: values => form.reset(values),
        load: async id => { const { product, packaging } = await RecipeEditingService.finished(id);
            return { values: { ...product, semi_finished_id: product.semi_finished_id == null ? '' : String(product.semi_finished_id),
                packaging: packaging.map(pkg => ({ packaging_material_id: String(pkg.packaging_material_id), quantity: pkg.quantity })) },
                hasRecipe: packaging.length > 0 }; },
        save: async (data, id, overrideCost) => { const productData = { code: data.code, name: data.name, unit: data.unit, min_stock: data.min_stock,
                sales_price: data.sales_price, semi_finished_id: data.semi_finished_id ? Number(data.semi_finished_id) : null,
                semi_finished_quantity: data.semi_finished_quantity,
                ...(id === null ? { quantity: data.quantity, unit_cost: data.unit_cost } : overrideCost ? { unit_cost: data.unit_cost } : {}) };
            const packaging = data.packaging.map(pkg => ({ packaging_material_id: Number(pkg.packaging_material_id), quantity: pkg.quantity }));
            return id === null ? InventoryService.createFinishedProductWithPackaging(productData as FinishedProduct, packaging)
                : InventoryService.updateFinishedProductWithPackaging(id, productData, packaging); },
        isEmpty: values => values.packaging.length === 0,
        afterSave: () => {
            for (const key of ['finishedProducts', 'item', 'item-ingredients', 'finished-packaging', 'base-semi', 'used-in',
                'report-inventory-valuation', 'product-cost-cards', 'report-low-stock-comprehensive', 'dashboard-stats', 'dashboard-balance-sheet', 'financial-balance-sheet', 'productionOrderItems', 'packagingOrderItems']) {
                void queryClient.invalidateQueries({ queryKey: [key] });
            }
        },
    });
    const isOpen = workspace.open, isEditMode = workspace.id !== null;
    const fetchNextCode = async () => {
        const entry = workspace.currentGeneration(), previous = form.getValues('code');
        try {
            const code = await InventoryService.getNextCode('finished_products', 'FP');
            if (entry === workspace.currentGeneration() && form.getValues('code') === previous) form.setValue('code', code);
        } catch { toast.error('تعذر اقتراح الكود. يمكنك إدخاله يدويًا أو إعادة المحاولة.'); }
    };

    const deleteMutation = useMutation({
        mutationFn: InventoryService.deleteFinishedProduct,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['finishedProducts'] });
            toast.success("تم الحذف بنجاح");
        },
        onError: (error) => toast.error("فشل الحذف: " + error.message)
    });

    const onSubmit = (data: ProductFormValues) => {
        let valid = true;
        data.packaging.forEach((row, index) => {
            if (!Number.isSafeInteger(Number(row.packaging_material_id)) || Number(row.packaging_material_id) <= 0) {
                form.setError(`packaging.${index}.packaging_material_id`, { message: 'اختر المادة' }); valid = false;
            }
            if (!Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1e9) {
                form.setError(`packaging.${index}.quantity`, { message: 'أدخل كمية موجبة لا تتجاوز مليارًا' }); valid = false;
            }
        });
        if (data.semi_finished_id && (!Number.isFinite(data.semi_finished_quantity) || data.semi_finished_quantity <= 0)) { form.setError('semi_finished_quantity', { message: 'أدخل كمية موجبة' }); valid = false; }
        if (valid) void workspace.submit(data);
    };

    const handleEdit = (item: FinishedProduct) => workspace.edit(item.id);

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
            semi_finished_id: '',
            semi_finished_quantity: 1,
            packaging: [{ packaging_material_id: "", quantity: 0 }]
        });
        void fetchNextCode();
    };

    const columns: ColumnDef<FinishedProduct>[] = [
        { accessorKey: "code", header: "الكود", enableSorting: true },
        { accessorKey: "name", header: "الاسم", enableSorting: true },
        { accessorKey: "quantity", header: "الكمية", enableSorting: true, cell: ({ row }) => <span dir="ltr">{formatInventoryQuantity(row.getValue("quantity"))}</span> },
        { accessorKey: "unit", header: "الوحدة", enableSorting: true },
        {
            accessorKey: "unit_cost",
            header: "التكلفة",
            enableSorting: true,
            cell: ({ row }) => <span>{formatInventoryCost(row.getValue("unit_cost"))}</span>
        },
        {
            accessorKey: "sales_price",
            header: "سعر البيع",
            enableSorting: true,
            cell: ({ row }) => <span>{formatCurrency(row.getValue("sales_price"))}</span>
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

    return (
        <div className="space-y-6">
            <PageHeader
                title="المنتجات النهائية"
                description="المنتجات الجاهزة للبيع ومواصفات تعبئتها"
                icon={Package2}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>تحديث القائمة</Button>
                        <Button onClick={handleAddNew}>
                            <Plus className="mr-2 h-4 w-4" /> منتج نهائي جديد
                        </Button>
                    </div>
                }
            />

            <CatalogReadState query={catalog} entity="قائمة المنتجات النهائية" onRetry={() => void catalog.refetch()}>
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

            </CatalogReadState>

            <Dialog open={isOpen} onOpenChange={open => { if (!open) void workspace.close(); }}>
                <DialogContent task className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{isEditMode ? "تعديل المنتج النهائي" : "تعريف منتج نهائي"}</DialogTitle>
                        <DialogDescription>
                            {isEditMode ? "تعديل مواصفات المنتج النهائي ومواد التعبئة." : "أدخل مواصفات المنتج النهائي الجديد ومواد التعبئة اللازمة."}
                        </DialogDescription>
                    </DialogHeader>
                    {workspace.state === 'loading' && <p role="status">جارٍ تحميل المنتج والوصفة…</p>}
                    {workspace.state === 'error' && <div role="alert" className="space-y-3"><p>تعذر تحميل الوصفة. لم نعرض وصفة فارغة، والحفظ غير متاح.</p><Button onClick={() => workspace.id !== null && void workspace.edit(workspace.id)}>إعادة المحاولة</Button></div>}
                    {workspace.state === 'ready' && <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <ReferenceReadNotice query={semiQuery} label="نصف المصنع" selectedValues={[form.watch('semi_finished_id')]} retry={() => void semiQuery.refetch()} />
                        <ReferenceReadNotice query={packagingQuery} label="مواد التعبئة" selectedValues={form.watch('packaging').map(item => item.packaging_material_id)} retry={() => void packagingQuery.refetch()} />
                        <fieldset disabled={workspace.locked} className="space-y-6 min-w-0">
                        {isEditMode && <p className="text-sm text-muted-foreground">آخر حفظ هو المعتمد عند التعديل من أكثر من مستخدم. حفظ البيانات والوصفة لا يغيّر رصيد المخزون.</p>}
                        {workspace.legacy && <p role="status">بعض كميات الوصفة محوّلة من نسب قديمة؛ ستُحفظ ككميات عند الحفظ.</p>}
                        {workspace.overrideCost && <p role="status" className="text-sm text-amber-700">سيُستبدل متوسط تكلفة الوحدة بالتكلفة المعتمدة: {formatInventoryCost(form.watch("unit_cost"))}</p>}
                        {/* Product Info */}
                        <FormGrid className="border-b pb-4">
                            <FormField label="الكود" required error={form.formState.errors.code?.message}>
                                <div className="flex gap-2">
                                    <Input {...form.register("code", { required: "مطلوب" })} placeholder="FP-001" readOnly={isEditMode} />
                                    {!isEditMode && (
                                        <Button type="button" variant="outline" size="icon" onClick={() => void fetchNextCode()} title="تحديث الكود" aria-label="اقتراح كود جديد">
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
                                <FormNumberInput type="number" step="any" control={form.control} name={"sales_price"} />
                            </FormField>
                            <FormField label="الكمية الحالية">
                                <FormNumberInput type="number" step="any" control={form.control} name={"quantity"} disabled={isEditMode} />
                            </FormField>
                        </FormGrid>

                        {/* Composition */}
                        <div className="space-y-4 border-b pb-4">
                            <h3 className="text-lg font-medium">التكوين الأساسي</h3>
                            <FormGrid>
                                <FormField label="المنتج النصف مصنع (الأساس)" error={form.formState.errors.semi_finished_id?.message}>
                                    <SearchableSelect
                                        ariaLabel="المنتج نصف المصنع الأساسي" options={semiFinished?.map(item => ({
                                            value: item.id.toString(),
                                            label: item.name,
                                            description: item.unit
                                        })) || []}
                                        value={form.watch("semi_finished_id")?.toString()}
                                        onValueChange={(val) => form.setValue("semi_finished_id", val, { shouldValidate: true, shouldDirty: true })}
                                        disabled={!semiFinished}
                                        placeholder={referencePlaceholder(form.watch('semi_finished_id'), semiFinished, 'اختر منتج نصف مصنع...')}
                                        searchPlaceholder="ابحث عن منتج..."
                                    />
                                </FormField>
                                <FormField label="الكمية المطلوبة (لكل وحدة نهائية)" required error={form.formState.errors.semi_finished_quantity?.message}>
                                    <FormNumberInput type="number" step="any" control={form.control} name={"semi_finished_quantity"} rules={{required: "مطلوب"}} />
                                </FormField>
                            </FormGrid>
                        </div>

                        {/* Packaging */}
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-3 justify-between items-center">
                                <h3 className="text-lg font-medium">مواد التعبئة والتغليف اللازمة</h3>
                                <div className="flex gap-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => {
                                        const values = form.getValues();
                                        const totalCost = finishedRecipeCost(values.semi_finished_id, values.semi_finished_quantity, semiFinished,
                                            values.packaging.map(pkg => ({ materialId: pkg.packaging_material_id, quantity: pkg.quantity })), packagingMaterials);
                                        if (totalCost === null) {
                                            toast.error('أكمل اختيار المكونات والكميات وتأكد من تحميل المواد قبل حساب التكلفة.'); return;
                                        }
                                        form.setValue("unit_cost", totalCost, { shouldDirty: true });
                                        workspace.setOverrideCost(true);
                                        toast.success(`تم حساب التكلفة الإجمالية: ${formatInventoryCost(totalCost)}`);
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
                                    <div key={field.id} className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                                        <div className="min-w-0 basis-full sm:basis-auto flex-1">
                                            <FormField label="مادة التعبئة" className="mb-0" error={form.formState.errors.packaging?.[index]?.packaging_material_id?.message}>
                                                <SearchableSelect
                                                    ariaLabel={`مادة التعبئة ${index + 1}`} options={packagingMaterials?.map(pm => ({
                                                        value: pm.id.toString(),
                                                        label: pm.name,
                                                        description: pm.unit
                                                    })) || []}
                                                    value={form.watch(`packaging.${index}.packaging_material_id`)}
                                                    onValueChange={(val) => form.setValue(`packaging.${index}.packaging_material_id`, val, { shouldValidate: true, shouldDirty: true })}
                                                    disabled={!packagingMaterials}
                                                    placeholder={referencePlaceholder(form.watch(`packaging.${index}.packaging_material_id`), packagingMaterials, 'اختر مادة...')}
                                                    searchPlaceholder="ابحث عن مادة..."
                                                />
                                            </FormField>
                                        </div>
                                        <div className="w-24">
                                            <FormField label="الكمية" className="mb-0" error={form.formState.errors.packaging?.[index]?.quantity?.message}>
                                                <FormNumberInput
                                                    type="number"
                                                    step="any" aria-label={`كمية مادة التعبئة ${index + 1}`}
                                                    control={form.control} name={`packaging.${index}.quantity` as const} rules={{required: "مطلوب"}}
                                                />
                                            </FormField>
                                        </div>
                                        <div className="pb-2">
                                            <Button type="button" variant="destructive" size="icon" aria-label={`حذف مادة التعبئة ${index + 1}`} onClick={() => remove(index)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        </fieldset>
                        <div className="sticky bottom-0 bg-background flex flex-wrap justify-end py-4 border-t">
                            <Button type="submit" disabled={workspace.locked}>
                                {workspace.saving ? "جاري الحفظ..." : "حفظ المنتج"}
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
