import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { BundlesService } from "@/services/BundlesService";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Package, Search, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { ProductBundle, BundleItem, BundleItemType } from "@/types";

const ITEM_TYPE_LABELS: Record<BundleItemType, string> = {
    'finished_product': 'منتج نهائي',
    'semi_finished': 'نصف مصنع',
    'raw_material': 'مادة خام',
    'packaging_material': 'مادة تعبئة',
};

interface BundleFormData {
    code: string;
    name: string;
    description?: string;
    min_stock: number;
    bundle_price: number;
    is_active: boolean;
    items: {
        item_type: BundleItemType;
        item_id: number;
        quantity: number;
    }[];
}

export default function Bundles() {
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [editingBundle, setEditingBundle] = useState<ProductBundle | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [viewBundle, setViewBundle] = useState<(ProductBundle & { items: BundleItem[] }) | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedItemType, setSelectedItemType] = useState<BundleItemType>("finished_product");
    const [itemOptions, setItemOptions] = useState<any[]>([]);

    const form = useForm<BundleFormData>({
        defaultValues: {
            code: "",
            name: "",
            description: "",
            min_stock: 0,
            bundle_price: 0,
            is_active: true,
            items: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items",
    });

    // Fetch bundles
    const { data: bundles = [], isLoading } = useQuery({
        queryKey: ["bundles"],
        queryFn: () => BundlesService.getBundles(),
    });

    // Fetch item options when type changes
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const items = await BundlesService.getItemsForType(selectedItemType);
                setItemOptions(items);
            } catch (error) {
                console.error("Error fetching items:", error);
            }
        };
        fetchItems();
    }, [selectedItemType]);

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (data: BundleFormData) => {
            const items = data.items.map(item => {
                const base: any = {
                    item_type: item.item_type,
                    quantity: item.quantity,
                };
                if (item.item_type === 'finished_product') base.finished_product_id = item.item_id;
                else if (item.item_type === 'semi_finished') base.semi_finished_product_id = item.item_id;
                else if (item.item_type === 'raw_material') base.raw_material_id = item.item_id;
                else if (item.item_type === 'packaging_material') base.packaging_material_id = item.item_id;
                return base;
            });
            return BundlesService.createBundle({
                code: data.code,
                name: data.name,
                description: data.description,
                min_stock: data.min_stock,
                bundle_price: data.bundle_price,
                is_active: data.is_active,
            }, items);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bundles"] });
            toast.success("تم إنشاء الباندل بنجاح");
            handleClose();
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء إنشاء الباندل");
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number; data: BundleFormData }) => {
            const items = data.items.map(item => {
                const base: any = {
                    item_type: item.item_type,
                    quantity: item.quantity,
                };
                if (item.item_type === 'finished_product') base.finished_product_id = item.item_id;
                else if (item.item_type === 'semi_finished') base.semi_finished_product_id = item.item_id;
                else if (item.item_type === 'raw_material') base.raw_material_id = item.item_id;
                else if (item.item_type === 'packaging_material') base.packaging_material_id = item.item_id;
                return base;
            });
            return BundlesService.updateBundle(id, {
                name: data.name,
                description: data.description,
                min_stock: data.min_stock,
                bundle_price: data.bundle_price,
                is_active: data.is_active,
            }, items);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bundles"] });
            toast.success("تم تحديث الباندل بنجاح");
            handleClose();
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء تحديث الباندل");
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: number) => BundlesService.deleteBundle(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bundles"] });
            toast.success("تم حذف الباندل بنجاح");
            setDeleteId(null);
        },
        onError: (error: any) => {
            toast.error(error.message || "حدث خطأ أثناء حذف الباندل");
        },
    });

    const handleClose = () => {
        setIsOpen(false);
        setEditingBundle(null);
        form.reset();
    };

    const handleEdit = async (bundle: ProductBundle) => {
        try {
            const fullBundle = await BundlesService.getBundle(bundle.id);
            setEditingBundle(bundle);
            form.reset({
                code: fullBundle.code,
                name: fullBundle.name,
                description: fullBundle.description || "",
                min_stock: fullBundle.min_stock,
                bundle_price: fullBundle.bundle_price,
                is_active: fullBundle.is_active,
                items: fullBundle.items?.map(item => ({
                    item_type: item.item_type,
                    item_id: item.finished_product_id || item.semi_finished_product_id ||
                        item.raw_material_id || item.packaging_material_id || 0,
                    quantity: item.quantity,
                })) || [],
            });
            setIsOpen(true);
        } catch (error) {
            toast.error("حدث خطأ أثناء تحميل بيانات الباندل");
        }
    };

    const handleView = async (bundle: ProductBundle) => {
        try {
            const fullBundle = await BundlesService.getBundle(bundle.id);
            setViewBundle(fullBundle);
        } catch (error) {
            toast.error("حدث خطأ أثناء تحميل بيانات الباندل");
        }
    };

    const handleNew = async () => {
        const code = await BundlesService.generateBundleCode();
        form.reset({
            code,
            name: "",
            description: "",
            min_stock: 0,
            bundle_price: 0,
            is_active: true,
            items: [],
        });
        setEditingBundle(null);
        setIsOpen(true);
    };

    const onSubmit = (data: BundleFormData) => {
        if (data.items.length === 0) {
            toast.error("يجب إضافة مكون واحد على الأقل");
            return;
        }
        if (editingBundle) {
            updateMutation.mutate({ id: editingBundle.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const addItem = () => {
        append({
            item_type: selectedItemType,
            item_id: 0,
            quantity: 1,
        });
    };

    const filteredBundles = bundles.filter(
        (b) =>
            b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">الباندلات</h1>
                    <p className="text-muted-foreground">إدارة حزم المنتجات والتجميعات</p>
                </div>
                <Button onClick={handleNew} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إضافة باندل
                </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="بحث بالاسم أو الكود..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                />
            </div>

            {/* Bundles Grid */}
            {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader className="h-20 bg-muted rounded-t-lg" />
                            <CardContent className="h-24" />
                        </Card>
                    ))}
                </div>
            ) : filteredBundles.length === 0 ? (
                <Card className="p-8 text-center">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">لا توجد باندلات</p>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredBundles.map((bundle) => (
                        <Card key={bundle.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <Badge variant={bundle.is_active ? "default" : "secondary"}>
                                            {bundle.is_active ? "نشط" : "غير نشط"}
                                        </Badge>
                                        <CardTitle className="mt-2 text-lg">{bundle.name}</CardTitle>
                                        <p className="text-sm text-muted-foreground">{bundle.code}</p>
                                    </div>
                                    <Package className="h-8 w-8 text-primary/50" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                                    <div>
                                        <span className="text-muted-foreground">الكمية:</span>
                                        <span className="font-medium mr-1">{bundle.quantity}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">سعر البيع:</span>
                                        <span className="font-medium mr-1">{bundle.bundle_price.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">التكلفة:</span>
                                        <span className="font-medium mr-1">{bundle.unit_cost.toFixed(2)}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">الحد الأدنى:</span>
                                        <span className="font-medium mr-1">{bundle.min_stock}</span>
                                    </div>
                                </div>
                                {bundle.quantity < bundle.min_stock && (
                                    <div className="flex items-center gap-1 text-amber-600 text-sm mb-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span>أقل من الحد الأدنى</span>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleView(bundle)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleEdit(bundle)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => setDeleteId(bundle.id)}
                                        disabled={bundle.quantity > 0}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingBundle ? "تعديل الباندل" : "إضافة باندل جديد"}</DialogTitle>
                        <DialogDescription>
                            {"أدخل بيانات الباندل وأضف المكونات المطلوبة"}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium">الكود</label>
                                <Input {...form.register("code")} disabled={!!editingBundle} />
                            </div>
                            <div>
                                <label className="text-sm font-medium">الاسم</label>
                                <Input {...form.register("name", { required: true })} />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium">الوصف</label>
                            <Textarea {...form.register("description")} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium">سعر البيع</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...form.register("bundle_price", { valueAsNumber: true })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">الحد الأدنى</label>
                                <Input
                                    type="number"
                                    {...form.register("min_stock", { valueAsNumber: true })}
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" {...form.register("is_active")} />
                                    <span className="text-sm font-medium">نشط</span>
                                </label>
                            </div>
                        </div>

                        {/* Items Section */}
                        <div className="border rounded-lg p-3 sm:p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <h3 className="font-medium">المكونات</h3>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Select
                                        value={selectedItemType}
                                        onValueChange={(v) => setSelectedItemType(v as BundleItemType)}
                                    >
                                        <SelectTrigger className="w-full sm:w-40">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
                                                <SelectItem key={value} value={value}>
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button type="button" size="sm" onClick={addItem}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {fields.length === 0 ? (
                                <div className="text-center py-8 bg-muted/30 rounded-lg">
                                    <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        لم تتم إضافة أي مكونات
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        اختر النوع ثم اضغط + لإضافة مكون
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {fields.map((field, index) => {
                                        const itemType = form.watch(`items.${index}.item_type`);
                                        const itemId = form.watch(`items.${index}.item_id`);
                                        const quantity = form.watch(`items.${index}.quantity`) || 0;
                                        const selectedItem = itemOptions.find(opt => opt.id === itemId);
                                        const itemCost = selectedItem?.unit_cost || 0;
                                        const lineCost = itemCost * quantity;

                                        return (
                                            <div key={field.id} className="bg-muted/30 p-3 rounded-lg space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Badge variant="outline" className="text-xs">
                                                        {ITEM_TYPE_LABELS[itemType]}
                                                    </Badge>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                                    <div className="sm:col-span-6">
                                                        <SearchableSelect
                                                            options={itemOptions.map((opt) => ({
                                                                value: String(opt.id),
                                                                label: opt.name,
                                                                description: `${opt.unit_cost?.toFixed(2) || 0} ج.م`
                                                            }))}
                                                            value={String(itemId || "")}
                                                            onValueChange={(v) =>
                                                                form.setValue(`items.${index}.item_id`, Number(v))
                                                            }
                                                            placeholder="اختر المنتج..."
                                                            searchPlaceholder="ابحث عن منتج..."
                                                            emptyMessage="لا توجد منتجات"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-3">
                                                        <Input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            placeholder="الكمية"
                                                            {...form.register(`items.${index}.quantity`, {
                                                                valueAsNumber: true,
                                                            })}
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-3 flex items-center justify-between sm:justify-end">
                                                        {selectedItem && (
                                                            <div className="text-sm flex sm:flex-col items-center sm:items-end gap-1">
                                                                <span className="text-muted-foreground text-xs">التكلفة:</span>
                                                                <span className="font-bold text-blue-600">
                                                                    {lineCost.toFixed(2)} ج.م
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Total Estimated Cost */}
                                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-3 rounded-lg flex justify-between items-center">
                                        <span className="font-medium">التكلفة التقديرية الإجمالية</span>
                                        <span className="font-bold text-lg text-blue-600">
                                            {fields.reduce((sum, _, index) => {
                                                const itemId = form.watch(`items.${index}.item_id`);
                                                const quantity = form.watch(`items.${index}.quantity`) || 0;
                                                const selectedItem = itemOptions.find(opt => opt.id === itemId);
                                                return sum + (selectedItem?.unit_cost || 0) * quantity;
                                            }, 0).toFixed(2)} ج.م
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleClose}>
                                إلغاء
                            </Button>
                            <Button
                                type="submit"
                                disabled={createMutation.isPending || updateMutation.isPending}
                            >
                                {editingBundle ? "حفظ التغييرات" : "إنشاء الباندل"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* View Dialog */}
            <Dialog open={!!viewBundle} onOpenChange={() => setViewBundle(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>تفاصيل الباندل</DialogTitle>
                        <DialogDescription>
                            عرض بيانات ومكونات الباندل
                        </DialogDescription>
                    </DialogHeader>
                    {viewBundle && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الكود</span>
                                    <span className="font-medium">{viewBundle.code}</span>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الاسم</span>
                                    <span className="font-medium">{viewBundle.name}</span>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الكمية</span>
                                    <span className="font-bold text-lg">{viewBundle.quantity}</span>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">الحالة</span>
                                    <Badge variant={viewBundle.is_active ? "default" : "secondary"}>
                                        {viewBundle.is_active ? "نشط" : "غير نشط"}
                                    </Badge>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">سعر البيع</span>
                                    <span className="font-bold text-green-600">{viewBundle.bundle_price.toFixed(2)} ج.م</span>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block">التكلفة</span>
                                    <span className="font-bold text-blue-600">{viewBundle.unit_cost.toFixed(2)} ج.م</span>
                                </div>
                            </div>
                            {viewBundle.description && (
                                <div className="bg-muted/30 p-3 rounded-lg">
                                    <span className="text-xs text-muted-foreground block mb-1">الوصف</span>
                                    <span>{viewBundle.description}</span>
                                </div>
                            )}
                            <div className="border-t pt-4">
                                <h4 className="font-medium mb-3">المكونات ({viewBundle.items?.length || 0})</h4>
                                <div className="space-y-2">
                                    {viewBundle.items?.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between bg-muted/30 p-3 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className="text-xs">
                                                    {ITEM_TYPE_LABELS[item.item_type]}
                                                </Badge>
                                                <span className="font-medium">{item.item_name}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-muted-foreground">
                                                    الكمية: <span className="font-bold text-foreground">{item.quantity}</span>
                                                </span>
                                                {item.unit_cost !== undefined && (
                                                    <span className="text-sm text-muted-foreground">
                                                        التكلفة: <span className="font-bold text-blue-600">{(item.unit_cost * item.quantity).toFixed(2)}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Profit Margin */}
                            {viewBundle.bundle_price > 0 && viewBundle.unit_cost > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-4 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">هامش الربح</span>
                                        <span className="font-bold text-lg text-purple-600">
                                            {((viewBundle.bundle_price - viewBundle.unit_cost) / viewBundle.bundle_price * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                        <span className="text-xs text-muted-foreground">صافي الربح للوحدة</span>
                                        <span className="font-bold text-green-600">
                                            {(viewBundle.bundle_price - viewBundle.unit_cost).toFixed(2)} ج.م
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                        <AlertDialogDescription>
                            هل أنت متأكد من حذف هذا الباندل؟ لا يمكن التراجع عن هذا الإجراء.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            حذف
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
