import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

type OrderType = 'production' | 'packaging';

interface OrderStats {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    cancelled: number;
    efficiencyRate: number;
}

interface Order {
    id: number;
    code: string;
    status: string;
    created_at: string;
    type: OrderType;
}

export default function ProductionReport() {
    const [activeTab, setActiveTab] = useState<OrderType>('production');

    const { data, isLoading } = useQuery({
        queryKey: ['report-production-packaging'],
        queryFn: async () => {
            // Fetch both production and packaging orders in parallel
            const [productionRes, packagingRes] = await Promise.all([
                supabase
                    .from('production_orders')
                    .select('id, code, status, created_at')
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase
                    .from('packaging_orders')
                    .select('id, code, status, created_at')
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);

            const processOrders = (orders: any[] | null, type: OrderType): Order[] => {
                return (orders || []).map(o => ({ ...o, type }));
            };

            const calculateStats = (orders: Order[]): OrderStats => {
                const total = orders.length;
                const completed = orders.filter(o => o.status === 'completed').length;
                const inProgress = orders.filter(o => o.status === 'inProgress').length;
                const pending = orders.filter(o => o.status === 'pending').length;
                const cancelled = orders.filter(o => o.status === 'cancelled').length;
                const efficiencyRate = total > 0 ? Math.round((completed / total) * 100) : 0;

                return { total, completed, inProgress, pending, cancelled, efficiencyRate };
            };

            const productionOrders = processOrders(productionRes.data, 'production');
            const packagingOrders = processOrders(packagingRes.data, 'packaging');

            const productionStats = calculateStats(productionOrders);
            const packagingStats = calculateStats(packagingOrders);

            // Combined stats
            const allOrders = [...productionOrders, ...packagingOrders];
            const combinedStats = calculateStats(allOrders);

            return {
                production: { orders: productionOrders, stats: productionStats },
                packaging: { orders: packagingOrders, stats: packagingStats },
                combined: { orders: allOrders, stats: combinedStats }
            };
        }
    });

    const getStatusBadge = (status: string) => {
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
                return <Badge variant="outline">{status}</Badge>;
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
        const primaryColor = isProduction ? 'blue' : 'purple';

        return (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 print:grid-cols-5">
                <Card className={`bg-${primaryColor}-50 dark:bg-${primaryColor}-900/20`}>
                    <CardHeader className="pb-2">
                        <CardTitle className={`text-sm font-medium text-${primaryColor}-600`}>
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

    const renderOrdersTable = (orders: Order[], type: OrderType) => {
        const isProduction = type === 'production';

        if (orders.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>لا توجد أوامر {isProduction ? 'إنتاج' : 'تعبئة'} حتى الآن</p>
                </div>
            );
        }

        return (
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
                    {orders.map((order) => (
                        <TableRow key={`${order.type}-${order.id}`}>
                            <TableCell className="font-medium font-mono">
                                {order.code || `#${order.id}`}
                            </TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="text-left text-muted-foreground text-sm font-mono">
                                {format(new Date(order.created_at), 'dd/MM/yyyy')}
                            </TableCell>
                            <TableCell className="text-left print:hidden">
                                <Button size="sm" variant="ghost" asChild>
                                    <Link to={isProduction ? `/production/orders/${order.id}` : `/packaging/${order.id}`}>
                                        عرض
                                    </Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
                        title="تقرير كفاءة الإنتاج والتعبئة"
                        description="تحليل شامل لأداء خطوط الإنتاج والتعبئة"
                        icon={Factory}
                    />
                </div>
                <div className="flex gap-2 mr-auto sm:mr-0">
                    <PrintButton />
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تقرير كفاءة الإنتاج والتعبئة</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={5} />
            ) : data && (
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
                            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                                <div className="text-center p-4 rounded-lg bg-white dark:bg-black/20 border">
                                    <p className="text-xs text-muted-foreground mb-1">إجمالي الأوامر</p>
                                    <p className="text-2xl font-bold">{data.combined.stats.total}</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100">
                                    <p className="text-xs text-muted-foreground mb-1">المكتملة</p>
                                    <p className="text-2xl font-bold text-green-600">{data.combined.stats.completed}</p>
                                </div>
                                <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100">
                                    <p className="text-xs text-muted-foreground mb-1">قيد التنفيذ</p>
                                    <p className="text-2xl font-bold text-blue-600">
                                        {data.combined.stats.inProgress + data.combined.stats.pending}
                                    </p>
                                </div>
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
                    <Tabs defaultValue="production" value={activeTab} onValueChange={(v) => setActiveTab(v as OrderType)}>
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
                                        سجل أوامر الإنتاج (آخر 50)
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
                                        سجل أوامر التعبئة (آخر 50)
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
                                {renderOrdersTable(data.production.orders, 'production')}
                            </div>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                أوامر التعبئة
                            </h2>
                            {renderStatsCards(data.packaging.stats, 'packaging')}
                            <div className="mt-4">
                                {renderOrdersTable(data.packaging.orders, 'packaging')}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
