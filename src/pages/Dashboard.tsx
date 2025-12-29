import { useQuery } from "@tanstack/react-query";
import { DashboardService } from "@/services/DashboardService";
import { FinancialService } from "@/services/FinancialService";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import {
    LayoutDashboard,
    Factory,
    Wallet,
    TrendingUp,
    AlertTriangle,
    ShoppingCart,
    ArrowUpRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { arEG } from "date-fns/locale";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Dashboard() {
    // Dates for detailed reports
    const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    // 1. Fetch aggregated real-time stats
    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: DashboardService.getStats,
        refetchInterval: 30000
    });

    // 2. Fetch P&L Summary (Restored)
    const { data: pnl, isLoading: loadingPnL } = useQuery({
        queryKey: ['dashboard-pnl', startDate, endDate],
        queryFn: () => FinancialService.getPnLReport(startDate, endDate)
    });

    // 3. Fetch Pending Orders Breakdown (Restored)
    const { data: pendingOrders, isLoading: loadingOrders } = useQuery({
        queryKey: ['dashboard-orders-breakdown'],
        queryFn: async () => {
            const [production, packaging] = await Promise.all([
                supabase.from('production_orders').select('id', { count: 'exact' }).in('status', ['pending', 'inProgress']),
                supabase.from('packaging_orders').select('id', { count: 'exact' }).in('status', ['pending', 'inProgress'])
            ]);
            return {
                production: production.count || 0,
                packaging: packaging.count || 0
            };
        }
    });

    const isLoading = loadingStats || loadingPnL || loadingOrders;

    return (
        <div className="space-y-6">
            <PageHeader
                title="لوحة التحكم"
                description={`نظرة عامة على أداء المصنع - ${format(new Date(), 'dd MMMM yyyy', { locale: arEG })}`}
                icon={LayoutDashboard}
            />

            {isLoading ? (
                <CardGridSkeleton count={4} />
            ) : (
                <div className="space-y-6">
                    {/* Main KPIs (Real-time) */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="إيرادات اليوم"
                            value={`${stats?.daily_sales.toLocaleString()} ج.م`}
                            icon={TrendingUp}
                            iconColor="text-green-500"
                            description="مبيعات الفواتير المعتمدة اليوم"
                            href="/commercial/selling"
                        />
                        <StatCard
                            title="رصيد الخزائن"
                            value={`${stats?.cash_balance.toLocaleString()} ج.م`}
                            icon={Wallet}
                            iconColor="text-emerald-500"
                            description="السيولة النقدية الحالية"
                            href="/commercial/treasuries"
                        />
                        <StatCard
                            title="أوامر نشطة"
                            value={stats?.active_orders || 0}
                            icon={Factory}
                            iconColor="text-blue-500"
                            description="تحت التشغيل (إنتاج وتعبئة)"
                            href="/production/orders"
                        />
                        <StatCard
                            title="تنبيهات المخزون"
                            value={stats?.low_stock_count || 0}
                            icon={AlertTriangle}
                            iconColor="text-amber-500"
                            description="مواد وصلت للحد الأدنى"
                            className={stats?.low_stock_count ? "border-amber-500/50 bg-amber-50/10" : ""}
                            href="/reports"
                        />
                    </div>

                    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                        {/* Right Column: Activity Feed (Takes 1/3 width) */}
                        <ActivityFeed activities={stats?.recent_activities || []} />

                        {/* Left Column: Detailed Reports (Takes 2/3 width) */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Restored: Financial Summary */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Wallet className="h-5 w-5 text-gray-500" />
                                        التقرير المالي ({format(new Date(), 'MMMM', { locale: arEG })})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100">
                                            <div className="text-xs text-muted-foreground mb-1">الإيرادات</div>
                                            <div className="text-lg font-bold text-blue-600">{pnl?.revenue.toLocaleString()}</div>
                                        </div>
                                        <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-100">
                                            <div className="text-xs text-muted-foreground mb-1">التكلفة</div>
                                            <div className="text-lg font-bold text-orange-600">{pnl?.cogs.toLocaleString()}</div>
                                        </div>
                                        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100">
                                            <div className="text-xs text-muted-foreground mb-1">المصروفات</div>
                                            <div className="text-lg font-bold text-red-600">{pnl?.expenses.toLocaleString()}</div>
                                        </div>
                                        <div className={`p-4 rounded-lg border ${(pnl?.netProfit || 0) >= 0 ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20' : 'bg-red-50 border-red-100 dark:bg-red-950/20'}`}>
                                            <div className="text-xs text-muted-foreground mb-1">صافي الربح</div>
                                            <div className={`text-lg font-bold ${(pnl?.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {pnl?.netProfit.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <Button variant="ghost" size="sm" asChild className="text-xs">
                                            <Link to="/financial/reports">عرض التقرير المفصل ←</Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Restored: Orders Breakdown & Quick Actions */}
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Orders Breakdown */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Factory className="h-5 w-5 text-orange-500" />
                                            تفاصيل الأوامر
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
                                            <span className="text-sm">أوامر الإنتاج</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">{pendingOrders?.production || 0}</span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                                                    <Link to="/production/orders"><ArrowUpRight className="h-4 w-4" /></Link>
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center p-2 bg-muted/50 rounded-md">
                                            <span className="text-sm">أوامر التعبئة</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">{pendingOrders?.packaging || 0}</span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                                                    <Link to="/packaging"><ArrowUpRight className="h-4 w-4" /></Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Quick Actions */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <ShoppingCart className="h-5 w-5 text-purple-500" />
                                            إجراءات سريعة
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/commercial/selling">فاتورة بيع</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/commercial/buying">فاتورة شراء</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/financial/expenses">مصروف</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild>
                                            <Link to="/inventory/raw-materials">المخزون</Link>
                                        </Button>
                                    </CardContent>
                                </Card>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
