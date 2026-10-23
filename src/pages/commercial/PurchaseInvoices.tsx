import { formatAmount as displayAmount, formatQuantity as displayQuantity, formatUnitCost as displayUnitCost } from '@/lib/number-format';
import {useConfirmation} from '@/hooks/use-confirmation';
import InvoiceForm from '@/components/commercial/InvoiceForm';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/contexts/AuthContext';
import { PurchaseInvoicesService,type PurchaseInvoice } from "@/services/PurchaseInvoicesService";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { Ban,Check,Eye,FileText,MoreHorizontal,Trash2 } from "lucide-react";
import { useEffect,useState } from "react";
import { useNavigate,useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export default function PurchaseInvoices() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState("list");
    const [formGuard,setFormGuard]=useState({dirty:false,pending:false});
    const {ask,confirmation}=useConfirmation();
    const changeTab=async(next:string)=>{if(next===activeTab||formGuard.pending)return;if(activeTab==='create'&&formGuard.dirty&&!(await ask({title:'تجاهل التعديلات غير المحفوظة؟',description:'ستُغلق مسودة الفاتورة دون حفظ التعديلات التي أدخلتها.',acceptLabel:'تجاهل التعديلات'})))return;setActiveTab(next);};
    const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { hasRole } = useAuth();

    // Auto-open create tab if action=create in URL
    useEffect(() => {
        if (searchParams.get('action') === 'create') {
            setActiveTab('create');
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const invoiceQuery = useQuery({
        queryKey: ['purchase_invoices'],
        queryFn: PurchaseInvoicesService.getInvoices, refetchOnWindowFocus: false
    });

    const invoices = !invoiceQuery.isFetching && !invoiceQuery.isError ? invoiceQuery.data : undefined;

    const processMutation = useMutation({
        mutationFn: PurchaseInvoicesService.processInvoice,
        onSuccess: () => {
            toast.success("تم اعتماد الفاتورة وتحديث المخزون والحسابات");
            queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
        },
        onError: (e) => toast.error("فشل الاعتماد: " + e.message)
    });

    const voidMutation = useMutation({
        mutationFn: PurchaseInvoicesService.voidInvoice,
        onSuccess: () => {
            toast.success("تم إلغاء الفاتورة واسترجاع المخزون والحسابات");
            queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
        },
        onError: (e) => toast.error("فشل الإلغاء: " + e.message)
    });

    const deleteMutation = useMutation({
        mutationFn: PurchaseInvoicesService.deleteInvoice,
        onSuccess: () => {
            toast.success("تم حذف المسودة بنجاح");
            queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
        },
        onError: (e) => {toast.error("فشل الحذف: " + e.message); void queryClient.invalidateQueries({queryKey: ['purchase_invoices']});}
    });

    // View Details Logic
    const actionBusy = processMutation.isPending || voidMutation.isPending || deleteMutation.isPending;
    const confirmAction = async (action: 'post' | 'delete' | 'void', invoice: {id: number; invoice_number: string}) => {
        if (actionBusy || invoiceQuery.isFetching || invoiceQuery.isError) return;
        const label = action === 'post' ? 'اعتماد' : action === 'void' ? 'إلغاء وعكس' : 'حذف مسودة';
        if (!(await ask({title: `${label} الفاتورة ${invoice.invoice_number || invoice.id}؟`, description: action === 'delete' ? 'ستُحذف المسودة فقط إذا بقيت قابلة للحذف. لن تظهر رسالة نجاح إذا تغيرت حالتها.' : action === 'post' ? 'سيُطبق أثر الفاتورة على المخزون والحسابات وفق القواعد الحالية.' : 'سيُعكس أثر الفاتورة وفق قواعد النظام الحالية. العمليات المرتبطة قد تمنع الإلغاء.', acceptLabel: label, cancelLabel: 'رجوع دون تنفيذ'}))) return;
        if (action === 'post') processMutation.mutate(invoice.id);
        else if (action === 'void') voidMutation.mutate(invoice.id);
        else deleteMutation.mutate(invoice.id);
    };

    const viewDetails = async (id: number) => {
        try {
            const data = await PurchaseInvoicesService.getInvoice(id);
            setSelectedInvoice(data);
        } catch (e) {
            toast.error("فشل تحميل التفاصيل");
        }
    };

    return (
        <div className="space-y-6">
            {confirmation}
            <PageHeader
                title="فواتير الشراء"
                description="تسجيل المشتريات من الموردين وتحديث المخزون"
                icon={FileText}
            />

            <Tabs value={activeTab} onValueChange={changeTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="list">قائمة الفواتير</TabsTrigger>
                    <TabsTrigger value="create">إنشاء فاتورة جديدة</TabsTrigger>
                </TabsList>

                <TabsContent value="list">
                    <Card>
                        <CardHeader><CardTitle>سجل الفواتير</CardTitle></CardHeader>
                        <CardContent>
                            {invoiceQuery.isFetching && <p role="status">جارٍ قراءة كل الفواتير…</p>}
                            {invoiceQuery.isError && <p role="alert">لم تكتمل قراءة الفواتير؛ أُخفيت القائمة لتجنب عرض بيانات ناقصة. <Button variant="outline" onClick={() => void invoiceQuery.refetch()}>إعادة المحاولة</Button></p>}
                            {!invoiceQuery.isFetching && !invoiceQuery.isError && invoices?.length === 0 && <p role="status">لا توجد فواتير.</p>}
                            <Table className="min-w-[680px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>رقم الفاتورة</TableHead>
                                        <TableHead>المورد</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                        <TableHead>المدفوع</TableHead>
                                        <TableHead>الحالة</TableHead>
                                        <TableHead>إجراءات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices?.map((inv) => (
                                        <TableRow
                                            key={inv.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => navigate(`/commercial/buying/${inv.id}`)}
                                        >
                                            <TableCell className="font-medium">{inv.invoice_number || inv.id}</TableCell>
                                            <TableCell>{inv.supplier?.name}</TableCell>
                                            <TableCell>{inv.transaction_date}</TableCell>
                                            <TableCell>{displayAmount(inv.total_amount)}</TableCell>
                                            <TableCell>{displayAmount(inv.paid_amount)}</TableCell>
                                            <TableCell>
                                                <Badge variant={inv.status === 'posted' ? 'success' : inv.status === 'void' ? 'destructive' : 'secondary'}>
                                                    {inv.status === 'posted' ? 'معتمدة' : inv.status === 'void' ? 'ملغاة' : 'مسودة'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell onClick={event=>event.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button disabled={actionBusy} aria-label="إجراءات الفاتورة" variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" onClick={event=>event.stopPropagation()}>
                                                        <DropdownMenuLabel>إجراءات</DropdownMenuLabel>

                                                        <DropdownMenuItem onClick={() => viewDetails(inv.id)}>
                                                            <Eye className="mr-2 h-4 w-4" /> عرض التفاصيل
                                                        </DropdownMenuItem>

                                                        {inv.status === 'draft' && (
                                                            <><DropdownMenuItem disabled={!hasRole(['admin','manager','accountant'])} onClick={() => navigate('/commercial/buying/'+inv.id+'/edit')}>تعديل المسودة</DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => void confirmAction('post', inv)}>
                                                                    <Check className="mr-2 h-4 w-4" /> اعتماد
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-red-600" onClick={() => void confirmAction('delete', inv)}>
                                                                    <Trash2 className="mr-2 h-4 w-4" /> حذف المسودة
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}

                                                        {inv.status === 'posted' && (
                                                            <DropdownMenuItem className="text-red-600" onClick={() => void confirmAction('void', inv)}>
                                                                <Ban className="mr-2 h-4 w-4" /> إلغاء الفاتورة (Void)
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="create">
                    <CreateInvoiceForm onGuardChange={setFormGuard} onSuccess={() => {
                        setActiveTab("list");
                        queryClient.invalidateQueries({ queryKey: ['purchase_invoices'] });
                    }} />
                </TabsContent>
            </Tabs>

            {/* View Details Dialog */}
            <Dialog open={!!selectedInvoice} onOpenChange={(o) => !o && setSelectedInvoice(null)}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>تفاصيل الفاتورة #{selectedInvoice?.invoice_number || selectedInvoice?.id}</DialogTitle>
                        <DialogDescription>حالة الفاتورة: {selectedInvoice?.status}</DialogDescription>
                    </DialogHeader>
                    {selectedInvoice && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b pb-4">
                                <div>
                                    <Label>المورد</Label>
                                    <div className="font-bold">{selectedInvoice.supplier?.name}</div>
                                </div>
                                <div>
                                    <Label>التاريخ</Label>
                                    <div className="font-bold">{selectedInvoice.transaction_date}</div>
                                </div>
                                <div>
                                    <Label>الإجمالي</Label>
                                    <div className="font-bold text-lg">{displayAmount(selectedInvoice.total_amount)}</div>
                                </div>
                            </div>

                            <Table className="min-w-[680px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>الصنف</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>السعر</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* Need to fetch items? getInvoice fetches them. I need to type check safely */}
                                    {(selectedInvoice as any).items?.map((item: any) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.item_type} #{item.raw_material_id || item.finished_product_id}</TableCell>
                                            <TableCell>{displayQuantity(item.quantity)}</TableCell>
                                            <TableCell>{displayUnitCost(item.unit_price)}</TableCell>
                                            <TableCell>{displayAmount(item.total_price)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CreateInvoiceForm({onSuccess,onGuardChange}:{onSuccess:()=>void;onGuardChange:(state:{dirty:boolean;pending:boolean})=>void}){return <InvoiceForm sale={false} onSuccess={onSuccess} onGuardChange={onGuardChange}/>;}
