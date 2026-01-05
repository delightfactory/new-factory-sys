import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type PackagingOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle, XCircle, Package, Eye, Loader2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShortageAnalysisDialog, type ShortageAnalysisResult } from "@/components/packaging/ShortageAnalysisDialog";

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
    const [pendingDemands, setPendingDemands] = useState<{ packagingDemand: Map<number, number>; semiFinishedDemand: Map<number, number> }>({ packagingDemand: new Map(), semiFinishedDemand: new Map() });
    const [viewOrderId, setViewOrderId] = useState<number | null>(null);
    // Smart Cascade State
    const [shortageDialogOpen, setShortageDialogOpen] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<ShortageAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [pendingCompleteOrderId, setPendingCompleteOrderId] = useState<number | null>(null);
    const [isCreatingProductionOrder, setIsCreatingProductionOrder] = useState(false);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();


    // Fetch order details when viewing
    const { data: orderDetails, isLoading: isLoadingDetails } = useQuery({
        queryKey: ['packagingOrderItems', viewOrderId],
        queryFn: () => viewOrderId ? InventoryService.getPackagingOrderItems(viewOrderId) : null,
        enabled: !!viewOrderId
    });

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

    // Auto-open create dialog if action=create in URL (must be after form init)
    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            form.reset();
            setIsOpen(true);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, form]);

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
            // Fetch pending demands when dialog opens
            InventoryService.getPendingPackagingDemand()
                .then(demands => setPendingDemands(demands))
                .catch(err => console.error('Failed to fetch pending demands', err));
        }
    }, [isOpen]);

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: OrderFormValues) => {
            let orderTotalCost = 0;
            const itemsData = data.items.map(item => {
                const prodId = item.finished_product_id;
                const quantity = item.quantity;
                const reqData = requirementsData[prodId];

                let unitCost = 0;

                if (reqData) {
                    // 1. Cost of semi-finished
                    if (reqData.semiFinished) {
                        const sfCost = (reqData.semiFinished.unitCost || 0) * reqData.semiFinished.quantityPerUnit;
                        unitCost += sfCost;
                    }

                    // 2. Cost of packaging materials
                    reqData.packagingMaterials.forEach((pkg: any) => {
                        const pkgCost = (pkg.unitCost || 0) * pkg.quantityPerUnit;
                        unitCost += pkgCost;
                    });
                }

                const itemTotalCost = unitCost * quantity;
                orderTotalCost += itemTotalCost;

                return {
                    finished_product_id: Number(prodId),
                    quantity: quantity,
                    unit_cost: parseFloat(unitCost.toFixed(2)),
                    total_cost: parseFloat(itemTotalCost.toFixed(2))
                };
            });

            const orderData = {
                code: data.code,
                date: data.date,
                notes: data.notes,
                status: 'pending' as const,
                total_cost: parseFloat(orderTotalCost.toFixed(2))
            };
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

    const handleComplete = async (id: number) => {
        // Set pending order and start analysis
        setPendingCompleteOrderId(id);
        setIsAnalyzing(true);
        setShortageDialogOpen(true);
        setAnalysisResult(null);

        try {
            const result = await InventoryService.analyzePackagingRequirements(id);
            setAnalysisResult(result);
        } catch (error: any) {
            toast.error("فشل تحليل المتطلبات: " + error.message);
            setShortageDialogOpen(false);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Proceed with packaging order completion
    const handleProceedAnyway = () => {
        if (pendingCompleteOrderId) {
            completeMutation.mutate(pendingCompleteOrderId);
            setShortageDialogOpen(false);
            setPendingCompleteOrderId(null);
            setAnalysisResult(null);
        }
    };

    // Create production order and optionally execute it
    const handleCreateProductionOrder = async (items: { semi_finished_id: number; quantity: number }[]) => {
        setIsCreatingProductionOrder(true);
        try {
            // Create production order
            const order = await InventoryService.createQuickProductionOrder(items);
            toast.success(`تم إنشاء أمر الإنتاج ${order.code}`);

            // Ask user if they want to execute it immediately
            const shouldExecute = window.confirm(
                `تم إنشاء أمر الإنتاج ${order.code}\n\n` +
                `هل تريد تنفيذه الآن لتوفير المنتجات النصف مصنعة؟`
            );

            if (shouldExecute) {
                await InventoryService.completeProductionOrderById(order.id);
                toast.success("تم تنفيذ أمر الإنتاج بنجاح");

                // Invalidate production orders queries
                queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
                queryClient.invalidateQueries({ queryKey: ['semiFinishedProducts'] });

                // Ask if user wants to complete packaging order now
                if (pendingCompleteOrderId) {
                    const shouldCompletePackaging = window.confirm(
                        `تم توفير المنتجات النصف مصنعة.\n\n` +
                        `هل تريد إكمال أمر التعبئة الآن؟`
                    );

                    if (shouldCompletePackaging) {
                        await InventoryService.completePackagingOrder(pendingCompleteOrderId);
                        toast.success("تم إكمال أمر التعبئة بنجاح");
                        queryClient.invalidateQueries({ queryKey: ['packagingOrders'] });
                        queryClient.invalidateQueries({ queryKey: ['finishedProducts'] });
                    } else {
                        toast.info("يمكنك إكمال أمر التعبئة لاحقاً من القائمة");
                    }
                }
            } else {
                // Just invalidate and notify user
                queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
                toast.info(`يمكنك تنفيذ أمر الإنتاج ${order.code} من صفحة أوامر الإنتاج`);
            }

            setShortageDialogOpen(false);
            setPendingCompleteOrderId(null);
            setAnalysisResult(null);
        } catch (error: any) {
            toast.error("فشل العملية: " + error.message);
        } finally {
            setIsCreatingProductionOrder(false);
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
                    <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setViewOrderId(item.id); }}>
                            <Eye className="w-4 h-4" />
                        </Button>
                        {item.status === 'pending' && (
                            <>
                                <Button size="sm" onClick={(e) => { e.stopPropagation(); handleComplete(item.id); }} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="w-4 h-4 mr-1" /> إتمام
                                </Button>
                                <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleCancel(item.id, 'pending'); }}>
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                        {item.status === 'completed' && (
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive" onClick={(e) => { e.stopPropagation(); handleCancel(item.id, 'completed'); }}>
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
                <DataTable
                    columns={columns}
                    data={orders}
                    onRowClick={(order) => navigate(`/packaging/orders/${order.id}`)}
                />
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
                                // AND aggregate demands from other items + pending orders
                                const materialItems: MaterialItem[] = (() => {
                                    if (!productRequirements || selectedQuantity <= 0) return [];
                                    const items: MaterialItem[] = [];

                                    // SEQUENTIAL LOGIC: Only items BEFORE current (lower index) have priority
                                    const prevSfDemand = new Map<number, number>();
                                    const prevPkgDemand = new Map<number, number>();
                                    fields.forEach((_, idx) => {
                                        if (idx >= index) return; // Skip current and all items AFTER
                                        const otherId = form.watch(`items.${idx}.finished_product_id`);
                                        const otherQty = form.watch(`items.${idx}.quantity`) || 0;
                                        const otherReq = requirementsData[otherId];
                                        if (!otherReq || otherQty <= 0) return;

                                        if (otherReq.semiFinished) {
                                            const needed = otherReq.semiFinished.quantityPerUnit * otherQty;
                                            prevSfDemand.set(otherReq.semiFinished.id, (prevSfDemand.get(otherReq.semiFinished.id) || 0) + needed);
                                        }
                                        otherReq.packagingMaterials.forEach((pkg: any) => {
                                            const needed = pkg.quantityPerUnit * otherQty;
                                            prevPkgDemand.set(pkg.id, (prevPkgDemand.get(pkg.id) || 0) + needed);
                                        });
                                    });

                                    // Add semi-finished product requirement with adjusted availability
                                    if (productRequirements.semiFinished) {
                                        const sf = productRequirements.semiFinished;
                                        const pendingReserved = pendingDemands.semiFinishedDemand.get(sf.id) || 0;
                                        const otherOrderDemand = prevSfDemand.get(sf.id) || 0;
                                        const adjustedAvailable = InventoryService.calculateAdjustedAvailability(
                                            sf.availableStock, pendingReserved, otherOrderDemand
                                        );
                                        items.push({
                                            id: sf.id,
                                            name: `نصف مصنع: ${sf.name}`,
                                            unit: sf.unit,
                                            requiredQty: Math.round(sf.quantityPerUnit * selectedQuantity * 100) / 100,
                                            availableQty: Math.round(adjustedAvailable * 100) / 100
                                        });
                                    }

                                    // Add packaging materials with adjusted availability
                                    productRequirements.packagingMaterials.forEach(pkg => {
                                        const pendingReserved = pendingDemands.packagingDemand.get(pkg.id) || 0;
                                        const otherOrderDemand = prevPkgDemand.get(pkg.id) || 0;
                                        const adjustedAvailable = InventoryService.calculateAdjustedAvailability(
                                            pkg.availableStock, pendingReserved, otherOrderDemand
                                        );
                                        items.push({
                                            id: pkg.id,
                                            name: pkg.name,
                                            unit: pkg.unit,
                                            requiredQty: Math.round(pkg.quantityPerUnit * selectedQuantity * 100) / 100,
                                            availableQty: Math.round(adjustedAvailable * 100) / 100
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

            {/* Order Details Dialog - Enhanced */}
            <Dialog open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="pb-4 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl flex items-center gap-2">
                                    <Package className="h-5 w-5 text-primary" />
                                    تفاصيل أمر التعبئة
                                </DialogTitle>
                                <DialogDescription className="mt-1">
                                    عرض تفاصيل الأمر والمنتجات المطلوبة
                                </DialogDescription>
                            </div>
                            {orders?.find(o => o.id === viewOrderId) && (
                                <Badge variant={
                                    orders.find(o => o.id === viewOrderId)?.status === 'completed' ? 'default' :
                                        orders.find(o => o.id === viewOrderId)?.status === 'pending' ? 'secondary' :
                                            orders.find(o => o.id === viewOrderId)?.status === 'cancelled' ? 'destructive' : 'outline'
                                } className="text-sm px-3 py-1">
                                    {orders.find(o => o.id === viewOrderId)?.status === 'pending' ? 'قيد الانتظار' :
                                        orders.find(o => o.id === viewOrderId)?.status === 'completed' ? 'مكتمل' :
                                            orders.find(o => o.id === viewOrderId)?.status === 'cancelled' ? 'ملغي' : 'جاري'}
                                </Badge>
                            )}
                        </div>
                    </DialogHeader>

                    {isLoadingDetails ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-6 pt-4">
                            {/* Order Header Info */}
                            {orders?.find(o => o.id === viewOrderId) && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-xs text-muted-foreground mb-1">رقم الأمر</div>
                                        <div className="font-bold text-lg">{orders.find(o => o.id === viewOrderId)?.code}</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-xs text-muted-foreground mb-1">التاريخ</div>
                                        <div className="font-medium">{orders.find(o => o.id === viewOrderId)?.date ? format(new Date(orders.find(o => o.id === viewOrderId)!.date), "dd/MM/yyyy") : '-'}</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-xs text-muted-foreground mb-1">عدد المنتجات</div>
                                        <div className="font-bold text-lg text-primary">{orderDetails?.length || 0}</div>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                                        <div className="text-xs text-muted-foreground mb-1">إجمالي الكميات</div>
                                        <div className="font-bold text-lg">{orderDetails?.reduce((sum, i: any) => sum + (i.quantity || 0), 0).toLocaleString()}</div>
                                    </div>
                                </div>
                            )}

                            {/* Notes if available */}
                            {orders?.find(o => o.id === viewOrderId)?.notes && (
                                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                    <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">ملاحظات</div>
                                    <div className="text-sm">{orders.find(o => o.id === viewOrderId)?.notes}</div>
                                </div>
                            )}

                            {/* Products Table */}
                            <div className="border rounded-lg overflow-hidden">
                                <div className="bg-muted/30 px-4 py-2 border-b">
                                    <h3 className="font-medium text-sm">المنتجات المطلوبة</h3>
                                </div>
                                {orderDetails && orderDetails.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/20">
                                                <TableHead className="font-bold">#</TableHead>
                                                <TableHead className="font-bold">المنتج النهائي</TableHead>
                                                <TableHead className="text-center font-bold">الكمية</TableHead>
                                                <TableHead className="text-center font-bold">الوحدة</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {orderDetails.map((item: any, idx: number) => (
                                                <TableRow key={item.id} className="hover:bg-muted/30">
                                                    <TableCell className="text-muted-foreground w-12">{idx + 1}</TableCell>
                                                    <TableCell className="font-medium">
                                                        {item.finished_products?.name || `ID: ${item.finished_product_id}`}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                                            {item.quantity?.toLocaleString()}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center text-muted-foreground">
                                                        {item.finished_products?.unit || '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="py-8 text-center text-muted-foreground">
                                        لا توجد منتجات في هذا الأمر
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Smart Cascade - Shortage Analysis Dialog */}
            <ShortageAnalysisDialog
                isOpen={shortageDialogOpen}
                onClose={() => {
                    setShortageDialogOpen(false);
                    setPendingCompleteOrderId(null);
                    setAnalysisResult(null);
                }}
                analysisResult={analysisResult}
                isLoading={isAnalyzing}
                onProceedAnyway={handleProceedAnyway}
                onCreateProductionOrder={handleCreateProductionOrder}
                isCreatingOrder={isCreatingProductionOrder}
            />
        </div>
    );
}
