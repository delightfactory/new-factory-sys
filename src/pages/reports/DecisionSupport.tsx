import { useQuery } from "@tanstack/react-query";
import { DecisionSupportService } from "@/services/DecisionSupportService";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Banknote,
    Factory,
    TrendingUp,
    Wallet,
    Package,
    Clock,
    DollarSign,
    BarChart3,
    RefreshCw
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function DecisionSupport() {
    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['decision-support'],
        queryFn: DecisionSupportService.getDecisionSupportData,
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    if (isLoading) {
        return (
            <div className="space-y-6 p-4">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <div className="grid gap-4 md:grid-cols-3">
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-32" />
                    ))}
                </div>
                <Skeleton className="h-64" />
            </div>
        );
    }

    const alertTypeStyles = {
        critical: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800',
        warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800',
        info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800'
    };

    const alertTypeIcons = {
        critical: <AlertTriangle className="h-5 w-5 text-red-600" />,
        warning: <AlertTriangle className="h-5 w-5 text-amber-600" />,
        info: <Activity className="h-5 w-5 text-blue-600" />
    };

    return (
        <div className="space-y-6 p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="نظام دعم القرار"
                        description="تحليلات فورية وتوصيات ذكية لدعم قراراتك"
                        icon={Activity}
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    تحديث البيانات
                </Button>
            </div>

            {/* Critical Alerts Section */}
            {data?.alerts && data.alerts.length > 0 && (
                <Card className="border-l-4 border-l-red-500">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            تنبيهات تحتاج قرار فوري
                            <Badge variant="destructive" className="mr-2">
                                {data.alerts.filter(a => a.type === 'critical').length}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {data.alerts.slice(0, 6).map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`flex items-start gap-3 p-3 rounded-lg border ${alertTypeStyles[alert.type]}`}
                                >
                                    {alertTypeIcons[alert.type]}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm">{alert.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {alert.description}
                                        </p>
                                    </div>
                                    <Button size="sm" variant="ghost" asChild className="shrink-0">
                                        <Link to={alert.action.path}>
                                            <ArrowLeft className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Liquidity Card */}
                <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                صافي السيولة
                            </CardTitle>
                            <Wallet className="h-4 w-4 text-emerald-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">
                            {formatCurrency(data?.liquidity.netCash || 0)}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <div className="flex justify-between">
                                <span>رصيد الخزائن</span>
                                <span>{formatCurrency(data?.liquidity.treasuryBalance || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>+ مستحقات العملاء</span>
                                <span className="text-green-600">+{formatCurrency(data?.liquidity.receivables || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>- مستحقات للموردين</span>
                                <span className="text-red-600">-{formatCurrency(data?.liquidity.payables || 0)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Production Status Card */}
                <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
                                أوامر معلقة
                            </CardTitle>
                            <Factory className="h-4 w-4 text-orange-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                            {(data?.production.pendingProduction || 0) + (data?.production.pendingPackaging || 0)}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-orange-600 dark:text-orange-400">
                            <div className="flex justify-between">
                                <span>إنتاج</span>
                                <span>{data?.production.pendingProduction || 0} أمر</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تعبئة</span>
                                <span>{data?.production.pendingPackaging || 0} أمر</span>
                            </div>
                            {data?.production.oldestPendingDays && data.production.oldestPendingDays > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>أقدم أمر</span>
                                    <span>{data.production.oldestPendingDays} يوم</span>
                                </div>
                            )}
                        </div>
                        <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                            <Link to="/production/orders">عرض الأوامر</Link>
                        </Button>
                    </CardContent>
                </Card>

                {/* Profitability Card */}
                <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                الربحية (30 يوم)
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-purple-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                            {data?.profitability.grossMarginPercent || 0}%
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-purple-600 dark:text-purple-400">
                            <div className="flex justify-between">
                                <span>الإيرادات</span>
                                <span>{formatCurrency(data?.profitability.revenue30d || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>تكلفة المبيعات</span>
                                <span>{formatCurrency(data?.profitability.cogs30d || 0)}</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                                <span>صافي الربح</span>
                                <span className="text-green-600">{formatCurrency(data?.profitability.grossMargin || 0)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Inventory Coverage Card */}
                <Card className="bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 border-cyan-200 dark:border-cyan-800">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                                تغطية المخزون
                            </CardTitle>
                            <Package className="h-4 w-4 text-cyan-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-cyan-800 dark:text-cyan-200">
                            {data?.coverage.filter(c => c.status === 'critical').length || 0}
                            <span className="text-sm font-normal mr-1">صنف حرج</span>
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-cyan-600 dark:text-cyan-400">
                            <div className="flex justify-between">
                                <span>تحذيرات</span>
                                <span>{data?.coverage.filter(c => c.status === 'warning').length || 0} صنف</span>
                            </div>
                            <div className="flex justify-between">
                                <span>سليم</span>
                                <span className="text-green-600">{data?.coverage.filter(c => c.status === 'ok').length || 0} صنف</span>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                            <Link to="/reports/low-stock">تقرير النواقص</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Inventory Coverage Details */}
            {data?.coverage && data.coverage.filter(c => c.status !== 'ok').length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-amber-500" />
                            مواد تحتاج إعادة طلب
                        </CardTitle>
                        <CardDescription>
                            بناءً على معدل الاستهلاك الفعلي (آخر 30 يوم)
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.coverage
                                .filter(c => c.status !== 'ok')
                                .slice(0, 8)
                                .map((item) => (
                                    <div key={`${item.type}-${item.id}`} className="flex items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium truncate">{item.name}</span>
                                                <Badge variant={item.status === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                                                    {item.daysLeft} يوم
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                <span>الرصيد: {item.quantity.toLocaleString()}</span>
                                                <span>•</span>
                                                <span>الاستهلاك/يوم: {item.avgDailyUsage.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <Progress
                                            value={Math.min((item.daysLeft / 30) * 100, 100)}
                                            className={`w-20 h-2 ${item.status === 'critical' ? '[&>div]:bg-red-500' : '[&>div]:bg-amber-500'}`}
                                        />
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Top Products */}
            {data?.profitability.topProducts && data.profitability.topProducts.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-green-500" />
                            أفضل المنتجات ربحية (آخر 30 يوم)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.profitability.topProducts.map((product, idx) => (
                                <div key={idx} className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white
                                        ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{product.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            إيرادات: {formatCurrency(product.revenue)}
                                        </p>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-green-600">{formatCurrency(product.margin)}</p>
                                        <p className="text-xs text-muted-foreground">صافي الربح</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Quick Actions */}
            <Card className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        إجراءات سريعة
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Button variant="outline" className="justify-start gap-2 h-auto py-3" asChild>
                            <Link to="/purchase/invoices?action=create">
                                <Banknote className="h-5 w-5 text-blue-500" />
                                <div className="text-right">
                                    <div className="font-medium">فاتورة شراء</div>
                                    <div className="text-xs text-muted-foreground">طلب مواد جديدة</div>
                                </div>
                            </Link>
                        </Button>
                        <Button variant="outline" className="justify-start gap-2 h-auto py-3" asChild>
                            <Link to="/production/orders?action=create">
                                <Factory className="h-5 w-5 text-orange-500" />
                                <div className="text-right">
                                    <div className="font-medium">أمر إنتاج</div>
                                    <div className="text-xs text-muted-foreground">تصنيع منتجات</div>
                                </div>
                            </Link>
                        </Button>
                        <Button variant="outline" className="justify-start gap-2 h-auto py-3" asChild>
                            <Link to="/sales/invoices?action=create">
                                <DollarSign className="h-5 w-5 text-green-500" />
                                <div className="text-right">
                                    <div className="font-medium">فاتورة بيع</div>
                                    <div className="text-xs text-muted-foreground">تسجيل مبيعات</div>
                                </div>
                            </Link>
                        </Button>
                        <Button variant="outline" className="justify-start gap-2 h-auto py-3" asChild>
                            <Link to="/reports/balance-sheet">
                                <BarChart3 className="h-5 w-5 text-purple-500" />
                                <div className="text-right">
                                    <div className="font-medium">الميزان المالي</div>
                                    <div className="text-xs text-muted-foreground">المركز المالي</div>
                                </div>
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Footer */}
            <div className="text-xs text-muted-foreground text-center">
                آخر تحديث: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('ar-EG') : '-'}
            </div>
        </div>
    );
}
