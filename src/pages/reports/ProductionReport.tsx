import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProductionReportService } from "@/services/ProductionReportService";
import {filterProductionReport,type OrderType,type OrderStats,type ReportOrder as Order,type StatusFilter} from "@/features/reports/production-report";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Factory,
    ArrowRight,
    CheckCircle2,
    Clock,
    XCircle,
    Package,
    TrendingUp,
    AlertCircle,
    PlayCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { format } from "date-fns";
import { PrintButton } from "@/components/print/PrintLayout";

export default function ProductionReport() {
    const [activeTab, setActiveTab] = useState<OrderType>('production');

    const [statusFilter,setStatusFilter]=useState<StatusFilter>('all');
    const [page,setPage]=useState(0);
    const query=useQuery({queryKey:['report-production-packaging'],queryFn:ProductionReportService.get,refetchOnWindowFocus:false});
    const loading=query.isPending||query.isFetching;
    const data=!loading&&!query.isError&&query.data?filterProductionReport(query.data,statusFilter):undefined;
    const statusLabels:Record<StatusFilter,string>={all:'كل الحالات',pending:'قيد الانتظار',inProgress:'جارٍ التنفيذ',completed:'مكتمل',cancelled:'ملغي',unknown:'حالة غير محددة'};

    const getStatusBadge = (status: string | null) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 gap-1">
                    <CheckCircle2 className="w-3 h-3" />مكتمل
                </Badge>;
            case 'inProgress':
                return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 gap-1">
                    <PlayCircle className="w-3 h-3" />جاري التنفيذ
                </Badge>;
            case 'pending':
                return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 gap-1">
                    <Clock className="w-3 h-3" />قيد الانتظار
                </Badge>;
            case 'cancelled':
                return <Badge variant="destructive" className="gap-1">
                    <XCircle className="w-3 h-3" />ملغي
                </Badge>;
            default:
                return <Badge variant="outline">{status||'غير محددة'}</Badge>;
        }
    };

    const getEfficiencyColor = (rate: number) => {
        if (rate >= 80) return 'text-green-600';
        if (rate >= 60) return 'text-amber-600';
        return 'text-red-600';
    };

    const getProgressColor = (rate: number) => {
        if (rate >= 80) return '[&>div]:bg-green-500';
        if (rate >= 60) return '[&>div]:bg-amber-500';
        return '[&>div]:bg-red-500';
    };

    const renderStatsCards = (stats: OrderStats, type: OrderType) => {
        const isProduction = type === 'production';
        const primaryCard = isProduction ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-purple-50 dark:bg-purple-900/20';
        const primaryText=isProduction?'text-blue-600':'text-purple-600';

        return (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 print:grid-cols-5">
                <Card className={primaryCard}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-sm font-medium ${primaryText}`}>
                            إجمالي الأوامر
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>

                <Card className="bg-green-50 dark:bg-green-900/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600">مكتملة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            {stats.completed}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-900/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600">جاري التنفيذ</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold flex items-center gap-2">
                            <PlayCircle className="w-5 h-5 text-blue-500" />
                            {stats.inProgress}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-amber-50 dark:bg-amber-900/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600">قيد الانتظار</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-amber-500" />
                            {stats.pending}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">نسبة الإنجاز</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${getEfficiencyColor(stats.efficiencyRate)}`}>
                            {stats.efficiencyRate}%
                        </div>
                        <Progress
                            value={stats.efficiencyRate}
                            className={`h-1.5 mt-2 ${getProgressColor(stats.efficiencyRate)}`}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    };

    const renderOrdersTable = (orders: Order[], type: OrderType, printAll=false) => {
        const isProduction = type === 'production';

        if (orders.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>{statusFilter==='all' ? `لا توجد أوامر ${isProduction ? 'إنتاج' : 'تعبئة'} حتى الآن` : 'لا توجد أوامر بالحالة المختارة'}</p>
                </div>
            );
        }

        const currentPage=Math.min(page,Math.max(0,Math.ceil(orders.length/50)-1));
        const visible=printAll?orders:orders.slice(currentPage*50,(currentPage+1)*50);
        return (<>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>رقم الأمر</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead className="text-left">تاريخ الإنشاء</TableHead>
                        <TableHead className="text-left print:hidden">التفاصيل</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visible.map((order) => (
                        <TableRow key={`${order.type}-${order.id}`}>
                            <TableCell className="font-medium font-mono">
                                {order.code || `#${order.id}`}
                            </TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="text-left text-muted-foreground text-sm font-mono">
                                {order.created_at&&!Number.isNaN(Date.parse(order.created_at))?format(new Date(order.created_at),'dd/MM/yyyy'):'غير محدد'}
                            </TableCell>
                            <TableCell className="text-left print:hidden">
                                <Button size="sm" variant="ghost" asChild>
                                    <Link to={isProduction ? `/production/orders/${order.id}` : `/packaging/orders/${order.id}`}>
                                        عرض
                                    </Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {!printAll&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden"><p className="text-sm text-muted-foreground">عرض {orders.length?Math.min(currentPage*50+1,orders.length):0}–{Math.min((currentPage+1)*50,orders.length)} من {orders.length} أمر</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>السابق</Button><Button variant="outline" disabled={(currentPage+1)*50>=orders.length} onClick={()=>setPage(currentPage+1)}>التالي</Button></div></div>}
            </>
        );
    };

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تقرير الإنتاج والتعبئة"
                        description="متابعة جميع الأوامر ونِسَب إنجازها حسب الحالة"
                        icon={Factory}
                    />
                </div>
                <div className="flex gap-2 mr-auto sm:mr-0">
                    <Button variant="outline" disabled={loading} onClick={()=>void query.refetch()}>تحديث التقرير</Button>
                    {data&&<PrintButton />}
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تقرير الإنتاج والتعبئة</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 print:hidden"><label htmlFor="production-status">حالة الأوامر</label><select id="production-status" className="h-10 rounded-md border bg-background px-3" value={statusFilter} onChange={event=>{setStatusFilter(event.target.value as StatusFilter);setPage(0);}}>{Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><p className="text-sm text-muted-foreground">الأرقام تشمل جميع الأوامر ضمن الحالة المختارة؛ نسبة الإنجاز = المكتمل ÷ إجمالي الأوامر.</p></div>
            <p className="hidden print:block">حالة الأوامر: {statusLabels[statusFilter]}</p>
            {loading ? (
                <div role="status" aria-label="جارٍ تحميل التقرير كاملًا"><CardGridSkeleton count={5} /></div>
            ) : query.isError ? <div role="alert" className="rounded-lg border border-destructive bg-destructive/5 p-5"><p>تعذر تحميل التقرير كاملًا. لم نعرض أرقامًا جزئية أو قديمة. أعد المحاولة.</p><Button className="mt-3" onClick={()=>void query.refetch()}>إعادة المحاولة</Button></div> : data && (
                <>
                    {/* Combined Summary */}
                    <Card className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/30 border-2">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-primary" />
                                ملخص الأداء العام
                            </CardTitle>
                            <CardDescription>إحصائيات مجمعة للإنتاج والتعبئة</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 print:grid-cols-6">
                                <div className="text-center p-4 rounded-lg bg-white dark:bg-black/20 border">
                                    <p className="text-xs text-muted-foreground mb-1">إجمالي الأوامر</p>
                                    <p className="text-2xl font-bold">{data.combined.stats.total}</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100">
                                    <p className="text-xs text-muted-foreground mb-1">المكتملة</p>
                                    <p className="text-2xl font-bold text-green-600">{data.combined.stats.completed}</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100">
                                    <p className="text-xs text-muted-foreground mb-1">مفتوحة (معلقة + جارية)</p>
                                    <p className="text-2xl font-bold text-blue-600">
                                        {data.combined.stats.inProgress + data.combined.stats.pending}
                                    </p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-white dark:bg-black/20 border"><p className="text-xs text-muted-foreground mb-1">ملغاة</p><p className="text-2xl font-bold">{data.combined.stats.cancelled}</p></div>
<div className="text-center p-4 rounded-lg bg-white dark:bg-black/20 border"><p className="text-xs text-muted-foreground mb-1">حالة غير محددة</p><p className="text-2xl font-bold">{data.combined.stats.total-data.combined.stats.completed-data.combined.stats.pending-data.combined.stats.inProgress-data.combined.stats.cancelled}</p></div>
<div className="text-center p-4 rounded-lg bg-white dark:bg-black/20 border">
                                    <p className="text-xs text-muted-foreground mb-1">نسبة الإنجاز الكلية</p>
                                    <p className={`text-2xl font-bold ${getEfficiencyColor(data.combined.stats.efficiencyRate)}`}>
                                        {data.combined.stats.efficiencyRate}%
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tabs for Production vs Packaging */}
                    <Tabs className="print:hidden" value={activeTab} onValueChange={(v) => {setActiveTab(v as OrderType);setPage(0);}}>
                        <TabsList className="grid w-full max-w-md grid-cols-2 print:hidden">
                            <TabsTrigger value="production" className="gap-2">
                                <Factory className="w-4 h-4" />
                                الإنتاج ({data.production.stats.total})
                            </TabsTrigger>
                            <TabsTrigger value="packaging" className="gap-2">
                                <Package className="w-4 h-4" />
                                التعبئة ({data.packaging.stats.total})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="production" className="space-y-6 mt-6">
                            {renderStatsCards(data.production.stats, 'production')}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Factory className="w-5 h-5 text-blue-500" />
                                        سجل أوامر الإنتاج
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <div className="min-w-[400px]">
                                        {renderOrdersTable(data.production.orders, 'production')}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="packaging" className="space-y-6 mt-6">
                            {renderStatsCards(data.packaging.stats, 'packaging')}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Package className="w-5 h-5 text-purple-500" />
                                        سجل أوامر التعبئة
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="overflow-x-auto">
                                    <div className="min-w-[400px]">
                                        {renderOrdersTable(data.packaging.orders, 'packaging')}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>

                    {/* Print: Show both */}
                    <div className="hidden print:block space-y-8">
                        <div>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Factory className="w-5 h-5" />
                                أوامر الإنتاج
                            </h2>
                            {renderStatsCards(data.production.stats, 'production')}
                            <div className="mt-4">
                                {renderOrdersTable(data.production.orders, 'production',true)}
                            </div>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                أوامر التعبئة
                            </h2>
                            {renderStatsCards(data.packaging.stats, 'packaging')}
                            <div className="mt-4">
                                {renderOrdersTable(data.packaging.orders, 'packaging',true)}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
