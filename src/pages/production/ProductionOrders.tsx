import { FormNumberInput } from '@/components/ui/number-input';
import { formatAmount as displayAmount, formatQuantity as displayQuantity, formatUnitCost as displayUnitCost } from '@/lib/number-format';
import { TaskActions } from '@/components/ui/task-actions';
import { useAuth } from '@/contexts/AuthContext';
import { DocumentEditingService, type EditableDocument } from '@/services/DocumentEditingService';
import { useConfirmation } from '@/hooks/use-confirmation';
import { useDocumentExitGuard } from '@/hooks/use-document-exit-guard';
import { factoryBusinessDay } from '@/platform/date/factory-business-day';
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { InventoryService } from "@/services/InventoryService";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { type ProductionOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle, XCircle, Factory, Eye, Loader2, AlertTriangle, Calculator } from "lucide-react";
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
import { useState, useEffect, useRef } from "react";
import { Badge } from "../../components/ui/badge";
import { format } from "date-fns";
import { MaterialPreviewCard, type MaterialItem } from "@/components/ui/material-preview-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

const freshOrderValues=():OrderFormValues=>({code:'',date:factoryBusinessDay(),notes:'',items:[{semi_finished_id:"",quantity:0}]});

export default function ProductionOrders() {
    const queryClient = useQueryClient();
    const actionBusy = useRef(false);
    const [orderAction, setOrderAction] = useState<string | null>(null);
    const actionConfirmation = useConfirmation();
    const actionFocus = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [previewReady,setPreviewReady]=useState(false);
    const [previewError,setPreviewError]=useState<string|null>(null);
    const [ingredientsData, setIngredientsData] = useState<Record<string, { batchSize: number; ingredients: any[] }>>({});
    const [loadingIngredients, setLoadingIngredients] = useState<Record<string, boolean>>({});
    const [pendingDemands, setPendingDemands] = useState<Map<number, number>>(new Map());
    const [viewOrderId, setViewOrderId] = useState<number | null>(null);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {hasRole} = useAuth();
    const canEdit = hasRole(['admin','manager','production_officer']);
    const editId = Number(searchParams.get('edit')) || null;
    const [editGeneration,setEditGeneration] = useState(0);
    const editorEntry=useLocation().key;
    const loadedEditor=useRef<string|null>(null);
    const previewEpoch=useRef(0);
    const openedDocument=useRef<EditableDocument|null>(null);
    const editQuery=useQuery({queryKey:['document-editor','production_order',editId,editorEntry,editGeneration],gcTime:0,
        queryFn:()=>DocumentEditingService.get('production_order',editId!),enabled:!!editId&&canEdit,
        retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});


    // Fetch order details when viewing
    const { data: orderDetails, isLoading: isLoadingDetails } = useQuery({
        queryKey: ['productionOrderItems', viewOrderId],
        queryFn: () => viewOrderId ? InventoryService.getProductionOrderItems(viewOrderId) : null,
        enabled: !!viewOrderId
    });

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
        defaultValues: freshOrderValues()
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Auto-open create dialog if action=create in URL (must be after form init)
    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            form.reset(freshOrderValues());
            exitGuard.protect();setIsOpen(true);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, form]);

    useEffect(()=>{previewEpoch.current++;return()=>{previewEpoch.current++;};},[isOpen,editId,editGeneration]);

    // Fetch Next Code
    useEffect(()=>{
        if(!isOpen)return;
        let active=true;
        setPreviewReady(false);setPreviewError(null);
        setIngredientsData({});
        setPendingDemands(new Map());
        if(!editId)InventoryService.getNextCode('production_orders','PO').then(code=>{if(active)form.setValue('code',code);}).catch(()=>toast.error('تعذر تحميل رقم الأمر. أعد فتح النموذج.'));
        InventoryService.getPendingProductionDemand(editId??undefined).then(data=>{if(active){setPendingDemands(data);setPreviewReady(true);}}).catch(()=>{if(active)setPreviewError('تعذر تحميل حجوزات المواد. معاينة التوفر غير مكتملة؛ أعد فتح النموذج لإعادة المحاولة.');});
        return()=>{active=false;};
    },[isOpen,editId,editGeneration,form]);

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: OrderFormValues) => {
            if(editId){
                if(!openedDocument.current)throw new Error('انتظر تحميل المستند قبل الحفظ.');
                return DocumentEditingService.save('production_order',openedDocument.current,{date:data.date,notes:data.notes,items:data.items.map(item=>({'semi_finished_id':Number(item.semi_finished_id),quantity:Number(item.quantity)}))});
            }
            let orderTotalCost = 0;
            const itemsData = data.items.map(item => {
                const prodId = item.semi_finished_id;
                const quantity = item.quantity;
                const ingData = ingredientsData[prodId];

                let itemTotalCost = 0;
                if (ingData && quantity > 0) {
                    const ratio = quantity / ingData.batchSize;
                    ingData.ingredients.forEach((ing: any) => {
                        const requiredQty = ing.quantityPerBatch * ratio;
                        itemTotalCost += requiredQty * (ing.unitCost || 0);
                    });
                }

                const unitCost = quantity > 0 ? itemTotalCost / quantity : 0;
                orderTotalCost += itemTotalCost;

                return {
                    semi_finished_id: Number(prodId),
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

            return InventoryService.createProductionOrder(orderData, itemsData);
        },
        onSuccess: () => {
            exitGuard.permitExit();
            if(editId){toast.success("حُفظت التعديلات؛ يتحدث المخزون عند التنفيذ.");queryClient.invalidateQueries();form.reset(form.getValues());navigate('/production/orders/'+editId);return;}
            queryClient.invalidateQueries({ queryKey: ['productionOrders'] });
            setIsOpen(false);
            toast.success("تم إنشاء أمر الإنتاج بنجاح");
            form.reset(freshOrderValues());
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const exitGuard=useDocumentExitGuard(isOpen && form.formState.isDirty,createMutation.isPending || orderAction !== null);
    const closeEditor=async()=>{if(!(await exitGuard.confirmDiscard()))return;form.reset(form.getValues());setIsOpen(false);if(editId){const next=new URLSearchParams(searchParams);next.delete('edit');setSearchParams(next,{replace:true});}};
    useEffect(()=>{
        if(!editId){if(loadedEditor.current){form.reset(freshOrderValues());setIsOpen(false);}loadedEditor.current=null;openedDocument.current=null;return;}
        const loadKey=String(editId)+':'+editorEntry+':'+editGeneration;
        if(!isOpen){setIsOpen(true);return;}
        if(!editQuery.data||loadedEditor.current===loadKey)return;
        loadedEditor.current=loadKey;exitGuard.protect();
        const epoch=previewEpoch.current;
        const document=editQuery.data;openedDocument.current=document;
        form.reset({code:document.header.code??'',date:document.header.date??'',notes:document.header.notes??'',items:document.items.map(item=>({semi_finished_id:String(item.semi_finished_id),quantity:Number(item.quantity)}))});
        for(const productId of [...new Set(document.items.map(item=>String(item.semi_finished_id)))]){
            setLoadingIngredients(prev=>({...prev,[productId]:true}));
            InventoryService.getSemiFinishedIngredientsWithStock(Number(productId)).then(data=>{if(epoch===previewEpoch.current)setIngredientsData(prev=>({...prev,[productId]:data}));})
                .catch(()=>{if(epoch===previewEpoch.current)setPreviewError('تعذر تحميل معاينة المواد. أعد فتح الأمر للمحاولة.');})
                .finally(()=>{if(epoch===previewEpoch.current)setLoadingIngredients(prev=>({...prev,[productId]:false}));});
        }
    },[isOpen,editId,editorEntry,editGeneration,editQuery.data,form]);

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

    const handleComplete = async (id: number) => {
        if (actionBusy.current || isOpen || createMutation.isPending || viewOrderId !== null) return;
        actionBusy.current = true; setOrderAction(`complete:${id}`); exitGuard.protect();
        try {
            if (!(await actionConfirmation.ask({ title: `إتمام أمر الإنتاج ${orders?.find(order => order.id === id)?.code ?? id}؟`,
                description: 'هل أنت متأكد من إتمام هذا الأمر؟ سيتم خصم المواد الخام وإضافة المنتج للمخزون. عند نقص الخام قد يصبح رصيده سالبًا وفق قواعد النظام الأصلية.',
                acceptLabel: 'إتمام الأمر', cancelLabel: 'رجوع' }, () => actionFocus.current?.querySelector<HTMLButtonElement>(`[data-order-action="complete:${id}"]`) ?? null))) return;
            await completeMutation.mutateAsync(id);
            actionFocus.current?.focus();
        } catch { actionFocus.current?.focus(); /* The mutation reports its error. */ }
        finally { actionBusy.current = false; setOrderAction(null); void queryClient.invalidateQueries({ queryKey: ['productionOrders'] }); }
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

    const handleCancel = async (id: number, status: string) => {
        if (actionBusy.current || isOpen || createMutation.isPending || viewOrderId !== null) return;
        const isCompleted = status === 'completed';
        actionBusy.current = true; setOrderAction(`cancel:${id}`); exitGuard.protect();
        try {
            if (!(await actionConfirmation.ask({ title: `${isCompleted ? 'إلغاء وعكس' : 'إلغاء'} أمر الإنتاج ${orders?.find(order => order.id === id)?.code ?? id}؟`,
                description: isCompleted
                    ? 'تحذير دقيق: سيتم عكس عملية الإنتاج بالكامل. سيتم خصم المنتج من المخزون وإعادة المواد الخام إليه. هل أنت متأكد تماماً؟'
                    : 'هل تريد إلغاء هذا الأمر؟',
                acceptLabel: isCompleted ? 'إلغاء وعكس العملية' : 'إلغاء الأمر', cancelLabel: 'رجوع' }, () => actionFocus.current?.querySelector<HTMLButtonElement>(`[data-order-action="cancel:${id}"]`) ?? null))) return;
            await cancelMutation.mutateAsync({ id, isCompleted });
            actionFocus.current?.focus();
        } catch { actionFocus.current?.focus(); /* The mutation reports its error. */ }
        finally { actionBusy.current = false; setOrderAction(null); void queryClient.invalidateQueries({ queryKey: ['productionOrders'] }); }
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
                const variants: Record<string, "warning" | "info" | "success" | "destructive"> = {
                    pending: "warning",
                    inProgress: "info",
                    completed: "success",
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
        {
            accessorKey: "total_cost",
            header: "إجمالي التكلفة",
            cell: ({ row }) => {
                const cost = row.getValue("total_cost") as number;
                return cost > 0 ? (
                    <span className="font-medium text-primary">
                        {displayAmount(cost)} ج.م
                    </span>
                ) : (
                    <span className="text-muted-foreground">-</span>
                );
            }
        },
        { accessorKey: "notes", header: "ملاحظات" },
        {
            id: "actions",
            header: "إجراءات",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex gap-2 justify-end" onClick={event=>event.stopPropagation()}>
                        {/* View Details Button - Always visible */}
                        <Button size="sm" variant="outline" aria-label={`عرض أمر الإنتاج ${item.code}`} disabled={orderAction !== null} onClick={() => setViewOrderId(item.id)}>
                            <Eye className="w-4 h-4" />
                        </Button>
                        {item.status === 'pending' && (
                            <><Button size="sm" variant="outline" disabled={!canEdit || orderAction !== null} onClick={()=>setSearchParams({edit:String(item.id)})}>تعديل</Button>
                                <Button size="sm" data-order-action={`complete:${item.id}`} disabled={orderAction !== null} onClick={() => handleComplete(item.id)} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="w-4 h-4 mr-1" /> إتمام
                                </Button>
                                <Button size="sm" variant="destructive" data-order-action={`cancel:${item.id}`} disabled={orderAction !== null} aria-label={`إلغاء أمر الإنتاج ${item.code}`} onClick={() => handleCancel(item.id, 'pending')}>
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                        {item.status === 'completed' && (
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive" data-order-action={`cancel:${item.id}`} disabled={orderAction !== null} onClick={() => handleCancel(item.id, 'completed')}>
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
        <div className="space-y-6 outline-none" ref={actionFocus} tabIndex={-1} aria-label="أوامر الإنتاج">
            {exitGuard.confirmation}
            {actionConfirmation.confirmation}
            {orderAction && <p role="status">جارٍ تأكيد العملية أو تنفيذها؛ انتظر النتيجة قبل المغادرة.</p>}
            <PageHeader
                title="أوامر الإنتاج"
                description="إدارة عمليات التصنيع ومتابعة الحالة"
                icon={Factory}
                actions={
                    <Button disabled={orderAction !== null} onClick={() => { form.reset(freshOrderValues()); exitGuard.protect(); setIsOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> أمر إنتاج جديد
                    </Button>
                }
            />

            {orders && orders.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={orders}
                    onRowClick={(order) => !actionBusy.current && navigate(`/production/orders/${order.id}`)}
                />
            ) : (
                <EmptyState
                    icon={Factory}
                    title="لا توجد أوامر إنتاج"
                    description="ابدأ بإنشاء أول أمر إنتاج"
                    action={
                        <Button disabled={orderAction !== null} onClick={() => { form.reset(freshOrderValues()); exitGuard.protect(); setIsOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> أمر إنتاج جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={open=>{if(!open)closeEditor();else setIsOpen(true);}}>
                <DialogContent task className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{editId?'تعديل أمر الإنتاج':'إنشاء أمر إنتاج جديد'}</DialogTitle>
                        <DialogDescription>{editId?'راجع البيانات والبنود قبل حفظ التعديلات.':'أدخل تفاصيل الأمر الجديد.'}</DialogDescription>
                    </DialogHeader>
                    {editId && (!canEdit || editQuery.isPending || editQuery.isError || editQuery.data?.header.status!=='pending') ?
                        <div role="alert">{!canEdit?'صلاحيات حسابك لا تسمح بالتعديل.':editQuery.isPending?'جارٍ تحميل الأمر…':editQuery.isError?editQuery.error.message:'يمكن تعديل أمر قيد الانتظار فقط.'}
                        {editQuery.isError&&<Button onClick={()=>void editQuery.refetch()}>إعادة المحاولة</Button>}</div>:
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <fieldset disabled={createMutation.isPending} className="space-y-6">
                        {previewError&&<p role="alert" className="rounded border border-destructive p-3 text-destructive">{previewError}</p>}
                        <FormGrid>
                            <FormField label="رقم الأمر" required error={form.formState.errors.code?.message}>
                                <Input aria-label="رقم الأمر" {...form.register("code", { required: "مطلوب" })} readOnly />
                            </FormField>
                            <FormField label="التاريخ" required error={form.formState.errors.date?.message}>
                                <Input aria-label="تاريخ الأمر" type="date" {...form.register("date", { required: "مطلوب" })} />
                            </FormField>
                            <FormField label="ملاحظات" className="col-span-1 md:col-span-2">
                                <Textarea aria-label="ملاحظات الأمر" maxLength={2000} {...form.register("notes")} />
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
                                    const epoch=previewEpoch.current;
                                    form.setValue(`items.${index}.semi_finished_id`, val, {shouldDirty:true});
                                    if (val && !ingredientsData[val]) {
                                        setLoadingIngredients(prev => ({ ...prev, [val]: true }));
                                        try {
                                            const data = await InventoryService.getSemiFinishedIngredientsWithStock(Number(val));
                                            if(epoch===previewEpoch.current)setIngredientsData(prev => ({ ...prev, [val]: data }));
                                        } catch {
                                            if(epoch===previewEpoch.current)setPreviewError('تعذر تحميل معاينة المواد. أعد فتح النموذج للمحاولة.');
                                        } finally {
                                            if(epoch===previewEpoch.current)setLoadingIngredients(prev => ({ ...prev, [val]: false }));
                                        }
                                    }
                                };

                                // Calculate required materials based on quantity and batch size
                                // AND calculate aggregated demands from OTHER items in this order
                                const materialItems: MaterialItem[] = (() => {
                                    if (!productIngredients || selectedQuantity <= 0) return [];
                                    const ratio = selectedQuantity / productIngredients.batchSize;

                                    // SEQUENTIAL LOGIC: Only items BEFORE current (lower index) have priority
                                    // Items earlier in the order "reserve" stock first
                                    const previousItemsDemand = new Map<number, number>();
                                    fields.forEach((_, idx) => {
                                        if (idx >= index) return; // Skip current and all items AFTER
                                        const otherId = form.watch(`items.${idx}.semi_finished_id`);
                                        const otherQty = form.watch(`items.${idx}.quantity`) || 0;
                                        const otherIngData = ingredientsData[otherId];
                                        if (!otherIngData || otherQty <= 0) return;

                                        const otherRatio = otherQty / otherIngData.batchSize;
                                        otherIngData.ingredients.forEach(ing => {
                                            const needed = ing.quantityPerBatch * otherRatio;
                                            previousItemsDemand.set(ing.id, (previousItemsDemand.get(ing.id) || 0) + needed);
                                        });
                                    });

                                    return productIngredients.ingredients.map(ing => {
                                        const requiredQty = Math.round(ing.quantityPerBatch * ratio * 100) / 100;
                                        const pendingReserved = pendingDemands.get(ing.id) || 0;
                                        const otherOrderDemand = previousItemsDemand.get(ing.id) || 0;
                                        const adjustedAvailable = InventoryService.calculateAdjustedAvailability(
                                            ing.availableStock,
                                            pendingReserved,
                                            otherOrderDemand
                                        );
                                        return {
                                            id: ing.id,
                                            name: ing.name,
                                            unit: ing.unit,
                                            requiredQty,
                                            availableQty: Math.round(adjustedAvailable * 100) / 100
                                        };
                                    });
                                })();

                                return (
                                    <div key={field.id} className="space-y-3">
                                        <div className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-end">
                                            <div className="w-full sm:col-span-7 md:col-span-8">
                                                <FormField label="المنتج (نصف مصنع)" className="space-y-1">
                                                    <SearchableSelect
                                                        options={products?.map(p => ({
                                                            value: p.id.toString(),
                                                            label: p.name,
                                                            description: `${p.unit} - رصيد: ${displayQuantity(p.quantity)}`
                                                        })) || []}
                                                        value={selectedProductId}
                                                        onValueChange={handleProductChange}
                                                        placeholder="اختر منتج..."
                                                        searchPlaceholder="ابحث عن منتج..."
                                                    />
                                                </FormField>
                                            </div>
                                            <div className="flex gap-2 items-end">
                                                <div className="flex-1 sm:col-span-4 md:col-span-3">
                                                    <FormField label="الكمية المطلوبة" className="space-y-1" error={form.formState.errors.items?.[index]?.quantity?.message}>
                                                        <FormNumberInput
                                                            aria-label={`كمية المنتج ${index+1}`}
                                                            type="number"
                                                            step="0.01"
                                                            control={form.control} name={`items.${index}.quantity` as const} rules={{required: "مطلوب", min:{value:0.000001,message:"أدخل كمية أكبر من صفر"}, max:{value:1e9,message:"الكمية أكبر من الحد المسموح"}}}
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="pb-2 sm:col-span-1">
                                                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}>
                                                        <XCircle className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Material Preview Card */}
                                        {(selectedProductId && selectedQuantity > 0) && (
                                            <MaterialPreviewCard
                                                title={`المواد الخام المطلوبة (${products?.find(p => p.id.toString() === selectedProductId)?.name || ''})`}
                                                materials={materialItems}
                                                isLoading={isLoadingIng || !previewReady || !!previewError}
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <Button type="button" variant="outline" size="sm" onClick={() => append({ semi_finished_id: "", quantity: 0 })} disabled={fields.length>=100} className="w-full">
                                <Plus className="h-4 w-4 mr-1" /> إضافة منتج آخر
                            </Button>
                        </div>

                        {/* BOM Cost Summary & Warnings Panel */}
                        {(() => {
                            // Calculate total BOM cost and missing materials
                            let totalEstimatedCost = 0;
                            const missingMaterials: { name: string; needed: number; available: number; unit: string }[] = [];

                            fields.forEach((_, idx) => {
                                const prodId = form.watch(`items.${idx}.semi_finished_id`);
                                const qty = form.watch(`items.${idx}.quantity`) || 0;
                                const ingData = ingredientsData[prodId];

                                if (ingData && qty > 0) {
                                    const ratio = qty / ingData.batchSize;
                                    ingData.ingredients.forEach((ing: any) => {
                                        const requiredQty = ing.quantityPerBatch * ratio;
                                        const cost = requiredQty * (ing.unitCost || 0);
                                        totalEstimatedCost += cost;

                                        if (requiredQty > ing.availableStock) {
                                            // Check if already in array
                                            const existing = missingMaterials.find(m => m.name === ing.name);
                                            if (!existing) {
                                                missingMaterials.push({
                                                    name: ing.name,
                                                    needed: Math.round(requiredQty * 100) / 100,
                                                    available: Math.round(ing.availableStock * 100) / 100,
                                                    unit: ing.unit
                                                });
                                            }
                                        }
                                    });
                                }
                            });

                            const hasItems = fields.some((_, idx) => {
                                const id = form.watch(`items.${idx}.semi_finished_id`);
                                const qty = form.watch(`items.${idx}.quantity`);
                                return id && qty > 0;
                            });

                            if (!hasItems) return null;

                            return (
                                <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Calculator className="h-5 w-5 text-blue-600" />
                                            <span className="font-medium">التكلفة التقديرية للمواد الخام</span>
                                        </div>
                                        <span className="text-xl font-bold text-blue-700 dark:text-blue-400">
                                            {displayAmount(totalEstimatedCost)} ج.م
                                        </span>
                                    </div>

                                    {missingMaterials.length > 0 && (
                                        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                                                <AlertTriangle className="h-4 w-4" />
                                                <span className="font-medium">تحذير: مواد غير كافية ({missingMaterials.length})</span>
                                            </div>
                                            <ul className="text-sm text-red-600 dark:text-red-300 space-y-1">
                                                {missingMaterials.slice(0, 5).map((m, i) => (
                                                    <li key={i} className="flex justify-between">
                                                        <span>{m.name}</span>
                                                        <span className="font-mono">مطلوب: {m.needed} / متاح: {m.available} {m.unit}</span>
                                                    </li>
                                                ))}
                                                {missingMaterials.length > 5 && (
                                                    <li className="text-xs opacity-70">... و{missingMaterials.length - 5} مواد أخرى</li>
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {createMutation.isError&&<div role="alert" className="text-destructive">{createMutation.error.message}{editId&&<Button type="button" variant="outline" onClick={async()=>{if(await exitGuard.confirmReplacement())setEditGeneration(value=>value+1);}}>تحميل النسخة الأحدث</Button>}</div>}
                        <TaskActions>
                            <Button type="button" variant="outline" onClick={closeEditor}>إلغاء</Button>
                            <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending ? "جارٍ الحفظ…" : editId ? "حفظ التعديلات" : "إنشاء الأمر"}
                            </Button>
                        </TaskActions>
                    </fieldset></form>}
                </DialogContent>
            </Dialog>

            {/* Order Details Dialog - Enhanced */}
            <Dialog open={!!viewOrderId} onOpenChange={(open) => !open && setViewOrderId(null)}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader className="pb-4 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl flex items-center gap-2">
                                    <Factory className="h-5 w-5 text-primary" />
                                    تفاصيل أمر الإنتاج
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
                                        <div className="font-bold text-lg">{displayQuantity(orderDetails?.reduce((sum, i: any) => sum + (i.quantity || 0), 0))}</div>
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
                                                <TableHead className="font-bold">المنتج (نصف مصنع)</TableHead>
                                                <TableHead className="text-center font-bold">الكمية</TableHead>
                                                <TableHead className="text-center font-bold">الوحدة</TableHead>
                                                <TableHead className="text-center font-bold">تكلفة الوحدة</TableHead>
                                                <TableHead className="text-center font-bold">الإجمالي</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {orderDetails.map((item: any, idx: number) => (
                                                <TableRow key={item.id} className="hover:bg-muted/30">
                                                    <TableCell className="text-muted-foreground w-12">{idx + 1}</TableCell>
                                                    <TableCell className="font-medium">
                                                        {item.semi_finished_products?.name || `ID: ${item.semi_finished_id}`}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                                            {displayQuantity(item.quantity)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center text-muted-foreground">
                                                        {item.semi_finished_products?.unit || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {item.unit_cost > 0 ? `${displayUnitCost(item.unit_cost)} ج.م` : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-center font-bold text-green-600 dark:text-green-400">
                                                        {item.total_cost > 0 ? `${displayAmount(item.total_cost)} ج.م` : '-'}
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
        </div>
    );
}
