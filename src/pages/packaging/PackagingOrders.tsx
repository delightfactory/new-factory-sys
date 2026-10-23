import { formatAmount as displayAmount, formatQuantity as displayQuantity, formatUnitCost as displayUnitCost } from '@/lib/number-format';
import { TaskActions } from '@/components/ui/task-actions';
import { useAuth } from '@/contexts/AuthContext';
import { DocumentEditingService, type EditableDocument } from '@/services/DocumentEditingService';
import { useConfirmation } from '@/hooks/use-confirmation';
import { PackagingCoverageService } from '@/services/PackagingCoverageService';
import { CoverageProgress } from '@/components/packaging/CoverageProgress';
import { startCoverage, readCoverage, listCoverage, archiveCoverage, chooseCoveragePackaging, coverageUncertain, type CoverageAttempt } from '@/features/packaging/coverage-intent';
import { useDocumentExitGuard } from '@/hooks/use-document-exit-guard';
import { factoryBusinessDay } from '@/platform/date/factory-business-day';
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
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
import { useState, useEffect, useRef, useCallback } from "react";
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

const freshOrderValues=():OrderFormValues=>({code:'',date:factoryBusinessDay(),notes:'',items:[{finished_product_id:"",quantity:0}]});

export default function PackagingOrders() {
    const queryClient = useQueryClient();
    const actionBusy = useRef(false);
    const [orderAction, setOrderAction] = useState<string | null>(null);
    const actionFocus = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [previewReady,setPreviewReady]=useState(false);
    const [previewError,setPreviewError]=useState<string|null>(null);
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
    const {user,hasRole} = useAuth();
    const [coverage, setCoverage] = useState<CoverageAttempt | null>(null);
    const [coverageError, setCoverageError] = useState<string | null>(null);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoveries, setRecoveries] = useState<CoverageAttempt[]>([]);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const coverageBusy = useRef(false), analysisEpoch = useRef(0);
    const coverageConfirmation = useConfirmation();
    const refreshRecoveries = useCallback(() => {
        try { setRecoveries(user ? listCoverage(sessionStorage, user.id).filter(attempt => attempt.stage !== 'completed') : []); setRecoveryError(null); }
        catch (error) { setRecoveryError(error instanceof Error ? error.message : 'تعذر قراءة سجل التغطية.'); }
    }, [user]);
    useEffect(() => { refreshRecoveries(); }, [refreshRecoveries]);
    useEffect(() => () => { analysisEpoch.current++; }, []);
    const coverageLocked = isCreatingProductionOrder || coverageUncertain(coverage);
    const canEdit = hasRole(['admin','manager','production_officer']);
    const editId = Number(searchParams.get('edit')) || null;
    const [editGeneration,setEditGeneration] = useState(0);
    const editorEntry=useLocation().key;
    const loadedEditor=useRef<string|null>(null);
    const previewEpoch=useRef(0);
    const openedDocument=useRef<EditableDocument|null>(null);
    const editQuery=useQuery({queryKey:['document-editor','packaging_order',editId,editorEntry,editGeneration],gcTime:0,
        queryFn:()=>DocumentEditingService.get('packaging_order',editId!),enabled:!!editId&&canEdit,
        retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});


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
        setRequirementsData({});
        setPendingDemands({packagingDemand:new Map(),semiFinishedDemand:new Map()});
        if(!editId)InventoryService.getNextCode('packaging_orders','PK').then(code=>{if(active)form.setValue('code',code);}).catch(()=>toast.error('تعذر تحميل رقم الأمر. أعد فتح النموذج.'));
        InventoryService.getPendingPackagingDemand(editId??undefined).then(data=>{if(active){setPendingDemands(data);setPreviewReady(true);}}).catch(()=>{if(active)setPreviewError('تعذر تحميل حجوزات المواد. معاينة التوفر غير مكتملة؛ أعد فتح النموذج لإعادة المحاولة.');});
        return()=>{active=false;};
    },[isOpen,editId,editGeneration,form]);

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: OrderFormValues) => {
            if(editId){
                if(!openedDocument.current)throw new Error('انتظر تحميل المستند قبل الحفظ.');
                return DocumentEditingService.save('packaging_order',openedDocument.current,{date:data.date,notes:data.notes,items:data.items.map(item=>({'finished_product_id':Number(item.finished_product_id),quantity:Number(item.quantity)}))});
            }
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
            exitGuard.permitExit();
            if(editId){toast.success("حُفظت التعديلات؛ يتحدث المخزون عند التنفيذ.");queryClient.invalidateQueries();form.reset(form.getValues());navigate('/packaging/orders/'+editId);return;}
            queryClient.invalidateQueries({ queryKey: ['packagingOrders'] });
            setIsOpen(false);
            toast.success("تم إنشاء أمر التعبئة بنجاح");
            form.reset(freshOrderValues());
        },
        onError: (error) => toast.error("حدث خطأ: " + error.message)
    });

    const exitGuard=useDocumentExitGuard((isOpen && form.formState.isDirty) || (shortageDialogOpen && coverageUncertain(coverage)), createMutation.isPending || (shortageDialogOpen && coverageLocked) || orderAction !== null);
    const closeEditor=async()=>{if(!(await exitGuard.confirmDiscard()))return;form.reset(form.getValues());setIsOpen(false);if(editId){const next=new URLSearchParams(searchParams);next.delete('edit');setSearchParams(next,{replace:true});}};
    useEffect(()=>{
        if(!editId){if(loadedEditor.current){form.reset(freshOrderValues());setIsOpen(false);}loadedEditor.current=null;openedDocument.current=null;return;}
        const loadKey=String(editId)+':'+editorEntry+':'+editGeneration;
        if(!isOpen){setIsOpen(true);return;}
        if(!editQuery.data||loadedEditor.current===loadKey)return;
        loadedEditor.current=loadKey;exitGuard.protect();
        const epoch=previewEpoch.current;
        const document=editQuery.data;openedDocument.current=document;
        form.reset({code:document.header.code??'',date:document.header.date??'',notes:document.header.notes??'',items:document.items.map(item=>({finished_product_id:String(item.finished_product_id),quantity:Number(item.quantity)}))});
        for(const productId of [...new Set(document.items.map(item=>String(item.finished_product_id)))]){
            setLoadingRequirements(prev=>({...prev,[productId]:true}));
            InventoryService.getFinishedProductRequirementsWithStock(Number(productId)).then(data=>{if(epoch===previewEpoch.current)setRequirementsData(prev=>({...prev,[productId]:data}));})
                .catch(()=>{if(epoch===previewEpoch.current)setPreviewError('تعذر تحميل معاينة المواد. أعد فتح الأمر للمحاولة.');})
                .finally(()=>{if(epoch===previewEpoch.current)setLoadingRequirements(prev=>({...prev,[productId]:false}));});
        }
    },[isOpen,editId,editorEntry,editGeneration,editQuery.data,form]);

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

    const invalidateCoverage = () => {
        for (const key of ['productionOrders','production-order','production-order-items','packagingOrders','packaging-order','packaging-order-items',
            'rawMaterials','packagingMaterials','semiFinishedProducts','finishedProducts','item','item-movements','inventory-movements','report-inventory-valuation','product-cost-cards','report-production-packaging','report-low-stock-comprehensive','dashboard-stats','dashboard-balance-sheet','dashboard-orders-breakdown','financial-balance-sheet']) {
            void queryClient.invalidateQueries({ queryKey: [key] });
        }
    };
    const coverageContext = (id: number) => {
        if (!user) throw Error('سجّل الدخول بنفس حساب محاولة التغطية.');
        return { storage: sessionStorage, actor: user.id, packagingOrderId: id };
    };
    const closeShortage = () => {
        if (coverageBusy.current || coverageUncertain(coverage)) return;
        analysisEpoch.current++; setShortageDialogOpen(false); setPendingCompleteOrderId(null);
        setAnalysisResult(null); setAnalysisError(null); setCoverage(null); setCoverageError(null); setIsAnalyzing(false);
    };
    const handleComplete = async (id: number) => {
        if (coverageBusy.current || actionBusy.current) return;
        const entry = ++analysisEpoch.current;
        exitGuard.protect(); setPendingCompleteOrderId(id); setShortageDialogOpen(true);
        setAnalysisResult(null); setAnalysisError(null); setCoverageError(null); setCoverage(null); setIsAnalyzing(true);
        try {
            const saved = readCoverage(coverageContext(id));
            if (saved) { setCoverage(saved); return; }
            const result = await InventoryService.analyzePackagingRequirements(id);
            if (entry !== analysisEpoch.current) return;
            if (!result.success || result.order_id !== id) throw Error('تعذر تأكيد متطلبات أمر التعبئة المحدد.');
            setAnalysisResult(result);
        } catch (error) {
            if (entry === analysisEpoch.current) setAnalysisError(error instanceof Error ? error.message : 'تعذر تحليل المتطلبات.');
        } finally { if (entry === analysisEpoch.current) setIsAnalyzing(false); }
    };
    const runCoverageStep = async (id: number) => {
        if (coverageBusy.current) return;
        coverageBusy.current = true; setIsCreatingProductionOrder(true); setCoverageError(null);
        try {
            const context = coverageContext(id);
            const next = await PackagingCoverageService.advance(context.actor, id);
            setCoverage(next);
            toast.success(next.stage === 'created' ? `تم حفظ أمر الإنتاج ${next.order?.code}` :
                next.stage === 'produced' ? 'تم تأكيد مرحلة الإنتاج. يمكنك متابعة التعبئة.' :
                    next.stage === 'completed' ? 'تم تأكيد اكتمال أمر التعبئة' : 'تم تحديث حالة التغطية');
        } catch (error) {
            setCoverageError(error instanceof Error ? error.message : 'تعذر تأكيد الخطوة. استكمل الطلب المحفوظ.');
        } finally {
            try { setCoverage(readCoverage(coverageContext(id))); } catch (error) { setCoverageError(error instanceof Error ? error.message : 'تعذر قراءة سجل التغطية.'); }
            coverageBusy.current = false; setIsCreatingProductionOrder(false); refreshRecoveries(); invalidateCoverage();
        }
    };
    const handleCreateProductionOrder = async (items: { semi_finished_id: number; quantity: number }[]) => {
        if (!pendingCompleteOrderId || coverageBusy.current) return;
        try {
            const context = coverageContext(pendingCompleteOrderId);
            const existing = readCoverage(context);
            if (existing) { setCoverage(existing); return; }
            const attempt = startCoverage({ ...context, mode: 'production', packagingAction: 'complete_packaging_order',
                payload: { date: factoryBusinessDay(), notes: `تغطية نقص أمر التعبئة #${pendingCompleteOrderId}`, items } });
            setCoverage(attempt); refreshRecoveries();
            await runCoverageStep(pendingCompleteOrderId);
        } catch (error) { setCoverageError(error instanceof Error ? error.message : 'تعذر حفظ محاولة التغطية؛ لم نرسل أمرًا جديدًا.'); }
    };
    const handleProceedAnyway = async () => {
        if (!pendingCompleteOrderId || coverageBusy.current || coverageUncertain(coverage)) return;
        const id = pendingCompleteOrderId;
        coverageBusy.current = true; setIsCreatingProductionOrder(true);
        let prepared = false;
        try {
            const context = coverageContext(id), existing = readCoverage(context);
            if (!analysisResult?.can_complete || existing) {
                const accepted = await coverageConfirmation.ask({ title: 'تنفيذ التعبئة رغم النقص؟',
                    description: 'قد ينتج عن التنفيذ رصيد مخزون سالب. لن ننفّذ أمر الإنتاج في هذه الخطوة، وسيبقى أي أمر إنتاج محفوظ متاحًا للمراجعة.',
                    acceptLabel: 'تنفيذ التعبئة رغم النقص', cancelLabel: 'الرجوع للمراجعة' });
                if (!accepted) return;
            }
            const attempt = existing ? chooseCoveragePackaging({ ...context, action: 'complete_packaging_order_allow_shortage' }) :
                startCoverage({ ...context, mode: 'packaging-only', packagingAction: 'complete_packaging_order_allow_shortage',
                    payload: { date: factoryBusinessDay(), notes: `تنفيذ أمر التعبئة #${id}`, items: [] } });
            setCoverage(attempt); prepared = true; refreshRecoveries();
        } catch (error) { setCoverageError(error instanceof Error ? error.message : 'تعذر تجهيز التنفيذ.'); }
        finally { coverageBusy.current = false; setIsCreatingProductionOrder(false); }
        if (prepared) await runCoverageStep(id);
    };
    const handleAdditionalCoverage = async () => {
        if (!pendingCompleteOrderId || coverageBusy.current || coverageUncertain(coverage) || !user) return;
        const id = pendingCompleteOrderId;
        coverageBusy.current = true; setIsCreatingProductionOrder(true);
        let archived = false;
        try {
            const order = await PackagingCoverageService.getOrder(user.id, 'packaging', id);
            if (!['pending','inProgress'].includes(order.status)) throw Error('أمر التعبئة مكتمل أو ملغى. راجع حالته؛ لا حاجة لإنشاء تغطية جديدة.');
            if (coverage?.productionSkipped && coverage.order) {
                const production = await PackagingCoverageService.getOrder(user.id, 'production', coverage.order.id);
                if (!['completed', 'cancelled'].includes(production.status)) throw Error('أمر الإنتاج المحفوظ لم يُنفّذ أو يُلغَ بعد. راجعه قبل إنشاء تغطية أخرى.');
            }
            const accepted = await coverageConfirmation.ask({ title: 'بدء محاولة تغطية إضافية؟',
                description: `ستُؤرشف المحاولة المحفوظة${coverage?.order ? ` لأمر الإنتاج ${coverage.order.code}` : ''} وتُقرأ المتطلبات من جديد. الأوامر السابقة ستبقى محفوظة؛ لن ننشئ أمرًا جديدًا حتى تختار ذلك من التحليل.`,
                acceptLabel: 'أرشفة المحاولة وتحديث التحليل', cancelLabel: 'الاحتفاظ بالمحاولة الحالية' });
            if (!accepted) return;
            archiveCoverage(coverageContext(id)); archived = true; refreshRecoveries();
        } catch (error) { setCoverageError(error instanceof Error ? error.message : 'تعذر بدء محاولة إضافية.'); }
        finally { coverageBusy.current = false; setIsCreatingProductionOrder(false); }
        if (archived) await handleComplete(id);
    };
    const finishCoverageTracking = () => {
        if (!pendingCompleteOrderId || coverageBusy.current || !coverage || !['completed', 'cancelled'].includes(coverage.stage)) return;
        try { archiveCoverage(coverageContext(pendingCompleteOrderId)); refreshRecoveries(); closeShortage(); }
        catch (error) { setCoverageError(error instanceof Error ? error.message : 'تعذر حفظ سجل المتابعة.'); }
    };

    const handleCancel = async (id: number, status: string) => {
        if (actionBusy.current || coverageBusy.current || shortageDialogOpen || isOpen || createMutation.isPending || viewOrderId !== null) return;
        try {
            if (coverageUncertain(readCoverage(coverageContext(id)))) {
                toast.info('توجد خطوة تغطية لم تتأكد نتيجتها لهذا الأمر؛ أكّدها من شريط الاستعادة أولًا.'); return;
            }
        } catch { toast.error('تعذر قراءة متابعة التغطية؛ أعد فتح الصفحة قبل إلغاء الأمر.'); return; }
        const isCompleted = status === 'completed';
        actionBusy.current = true; setOrderAction(`cancel:${id}`); exitGuard.protect();
        try {
            if (!(await coverageConfirmation.ask({ title: `${isCompleted ? 'إلغاء وعكس' : 'إلغاء'} أمر التعبئة ${orders?.find(order => order.id === id)?.code ?? id}؟`,
                description: isCompleted
                    ? 'تحذير: سيتم عكس عملية التعبئة. سيتم إعادة المكونات للمخزون وخصم المنتج النهائي. هل أنت متأكد؟'
                    : 'هل تريد إلغاء هذا الأمر؟',
                acceptLabel: isCompleted ? 'إلغاء وعكس العملية' : 'إلغاء الأمر', cancelLabel: 'رجوع' }, () => actionFocus.current?.querySelector<HTMLButtonElement>(`[data-order-action="cancel:${id}"]`) ?? null))) return;
            await cancelMutation.mutateAsync({ id, isCompleted });
            actionFocus.current?.focus();
        } catch { actionFocus.current?.focus(); /* The mutation reports its error. */ }
        finally { actionBusy.current = false; setOrderAction(null); invalidateCoverage(); }
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
                    <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" aria-label={`عرض أمر التعبئة ${item.code}`} disabled={orderAction !== null} onClick={(e) => { e.stopPropagation(); setViewOrderId(item.id); }}>
                            <Eye className="w-4 h-4" />
                        </Button>
                        {item.status === 'pending' && (
                            <><Button size="sm" variant="outline" disabled={!canEdit || orderAction !== null} onClick={()=>setSearchParams({edit:String(item.id)})}>تعديل</Button>
                                <Button size="sm" disabled={orderAction !== null} onClick={(e) => { e.stopPropagation(); handleComplete(item.id); }} className="bg-green-600 hover:bg-green-700">
                                    <CheckCircle className="w-4 h-4 mr-1" /> إتمام
                                </Button>
                                <Button size="sm" variant="destructive" data-order-action={`cancel:${item.id}`} disabled={orderAction !== null} aria-label={`إلغاء أمر التعبئة ${item.code}`} onClick={(e) => { e.stopPropagation(); handleCancel(item.id, 'pending'); }}>
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                        {item.status === 'completed' && (
                            <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive" data-order-action={`cancel:${item.id}`} disabled={orderAction !== null} onClick={(e) => { e.stopPropagation(); handleCancel(item.id, 'completed'); }}>
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
        <div className="space-y-6 outline-none" ref={actionFocus} tabIndex={-1} aria-label="أوامر التعبئة">
            {exitGuard.confirmation}
            {coverageConfirmation.confirmation}
            {orderAction && <p role="status">جارٍ تأكيد العملية أو تنفيذها؛ انتظر النتيجة قبل المغادرة.</p>}
            {recoveryError && <div role="alert" className="rounded-lg border border-destructive p-4">{recoveryError}</div>}
            {recoveries.length > 0 && <section aria-label="عمليات تغطية محفوظة" className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <h2 className="font-semibold">عمليات تغطية محفوظة</h2>
                {recoveries.map(attempt => <div key={attempt.packagingOrderId} className="flex flex-wrap items-center justify-between gap-3">
                    <span>أمر التعبئة #{attempt.packagingOrderId}{attempt.order ? ` — أمر الإنتاج ${attempt.order.code}` : ''}{coverageUncertain(attempt) ? ' — النتيجة بانتظار التأكيد' : ' — متابعة من الخطوة المحفوظة'}</span>
                    <Button variant="outline" disabled={isCreatingProductionOrder || orderAction !== null} onClick={() => void handleComplete(attempt.packagingOrderId)}>متابعة الأمر #{attempt.packagingOrderId}</Button>
                </div>)}
            </section>}
            <PageHeader
                title="أوامر التعبئة"
                description="تعبئة المنتجات النهائية ومتابعة المخزون"
                icon={Package}
                actions={
                    <Button disabled={orderAction !== null} onClick={() => { form.reset(freshOrderValues()); exitGuard.protect(); setIsOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" /> أمر تعبئة جديد
                    </Button>
                }
            />

            {orders && orders.length > 0 ? (
                <DataTable
                    columns={columns}
                    data={orders}
                    onRowClick={(order) => !actionBusy.current && navigate(`/packaging/orders/${order.id}`)}
                />
            ) : (
                <EmptyState
                    icon={Package}
                    title="لا توجد أوامر تعبئة"
                    description="ابدأ بإنشاء أول أمر تعبئة"
                    action={
                        <Button disabled={orderAction !== null} onClick={() => { form.reset(freshOrderValues()); exitGuard.protect(); setIsOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> أمر تعبئة جديد
                        </Button>
                    }
                />
            )}

            <Dialog open={isOpen} onOpenChange={open=>{if(!open)closeEditor();else setIsOpen(true);}}>
                <DialogContent task className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{editId?'تعديل أمر التعبئة':'إنشاء أمر تعبئة جديد'}</DialogTitle>
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
                                    const epoch=previewEpoch.current;
                                    form.setValue(`items.${index}.finished_product_id`, val, {shouldDirty:true});
                                    if (val && !requirementsData[val]) {
                                        setLoadingRequirements(prev => ({ ...prev, [val]: true }));
                                        try {
                                            const data = await InventoryService.getFinishedProductRequirementsWithStock(Number(val));
                                            if(epoch===previewEpoch.current)setRequirementsData(prev => ({ ...prev, [val]: data }));
                                        } catch {
                                            if(epoch===previewEpoch.current)setPreviewError('تعذر تحميل معاينة المواد. أعد فتح النموذج للمحاولة.');
                                        } finally {
                                            if(epoch===previewEpoch.current)setLoadingRequirements(prev => ({ ...prev, [val]: false }));
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
                                        <div className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-end">
                                            <div className="w-full sm:col-span-7 md:col-span-8">
                                                <FormField label="المنتج النهائي" className="space-y-1">
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
                                                        <Input
                                                            aria-label={`كمية المنتج ${index+1}`}
                                                            type="number"
                                                            step="1"
                                                            {...form.register(`items.${index}.quantity` as const, { valueAsNumber: true, required: "مطلوب", min:{value:0.000001,message:"أدخل كمية أكبر من صفر"},max:{value:1e9,message:"الكمية أكبر من الحد المسموح"} })}
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
                                                title={`متطلبات التعبئة (${products?.find(p => p.id.toString() === selectedProductId)?.name || ''})`}
                                                materials={materialItems}
                                                isLoading={isLoadingReq || !previewReady || !!previewError}
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <Button type="button" variant="outline" size="sm" onClick={() => append({ finished_product_id: "", quantity: 0 })} disabled={fields.length>=100} className="w-full">
                                <Plus className="h-4 w-4 mr-1" /> إضافة منتج آخر
                            </Button>
                        </div>

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
                                                <TableHead className="font-bold">المنتج النهائي</TableHead>
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
                                                        {item.finished_products?.name || `ID: ${item.finished_product_id}`}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                                            {displayQuantity(item.quantity)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center text-muted-foreground">
                                                        {item.finished_products?.unit || '-'}
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

            {/* Smart Cascade - Shortage Analysis Dialog */}
            <ShortageAnalysisDialog
                key={analysisResult ? `analysis-${analysisResult.order_id}` : `waiting-${pendingCompleteOrderId}`}
                isOpen={shortageDialogOpen}
                onClose={closeShortage}
                analysisResult={analysisResult}
                isLoading={isAnalyzing}
                onProceedAnyway={handleProceedAnyway}
                onCreateProductionOrder={handleCreateProductionOrder}
                isCreatingOrder={isCreatingProductionOrder}
                error={analysisError || (!coverage ? coverageError : null)}
                onRetry={() => pendingCompleteOrderId && void handleComplete(pendingCompleteOrderId)}
                locked={coverageLocked}
                progress={coverage && <CoverageProgress attempt={coverage} busy={isCreatingProductionOrder} error={coverageError}
                    onAdvance={() => pendingCompleteOrderId && void runCoverageStep(pendingCompleteOrderId)}
                    onAllowShortage={() => void handleProceedAnyway()} onAdditional={() => void handleAdditionalCoverage()} onArchive={finishCoverageTracking} />}
            />
        </div>
    );
}
