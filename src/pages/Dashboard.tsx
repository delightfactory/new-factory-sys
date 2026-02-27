import { useQuery } from "@tanstack/react-query";
import { DashboardService } from "@/services/DashboardService";
import { FinancialService } from "@/services/FinancialService";
import { BalanceSheetService } from "@/services/BalanceSheetService";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import {
    LayoutDashboard,
    Factory,
    Wallet,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    ShoppingCart,
    ArrowUpRight,
    Package,
    Scale,
    Percent
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";
import { arEG } from "date-fns/locale";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

export default function Dashboard() {
    const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    // Previous month dates
    const prevMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
    const prevMonthEnd = format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');

    // 1. Fetch aggregated real-time stats
    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: DashboardService.getStats,
        refetchInterval: 30000
    });

    // 2. Fetch P&L Summary
    const { data: pnl, isLoading: loadingPnL } = useQuery({
        queryKey: ['dashboard-pnl', startDate, endDate],
        queryFn: () => FinancialService.getPnLReport(startDate, endDate)
    });

    // 3. Previous month P&L for comparison
    const { data: prevPnl } = useQuery({
        queryKey: ['dashboard-prev-pnl', prevMonthStart, prevMonthEnd],
        queryFn: () => FinancialService.getPnLReport(prevMonthStart, prevMonthEnd)
    });

    // 4. Fetch Pending Orders Breakdown
    const { data: pendingOrders, isLoading: loadingOrders } = useQuery({
        queryKey: ['dashboard-orders-breakdown'],
        queryFn: async () => {
            const [production, packaging] = await Promise.all([
                supabase.from('production_orders').select('id', { count: 'exact' }).in('status', ['pending', 'inProgress']),
                supabase.from('packaging_orders').select('id', { count: 'exact' }).in('status', ['pending', 'inProgress'])
            ]);
            return { production: production.count || 0, packaging: packaging.count || 0 };
        }
    });

    // 5. Balance Sheet for inventory value and net position
    const { data: balanceSheet } = useQuery({
        queryKey: ['dashboard-balance-sheet'],
        queryFn: () => BalanceSheetService.getBalanceSheet()
    });

    // 6. 7-day sales sparkline (single query)
    const { data: sparklineData } = useQuery({
        queryKey: ['dashboard-sparkline'],
        queryFn: async () => {
            const startDate = format(subDays(new Date(), 6), 'yyyy-MM-dd');
            const endDate = format(new Date(), 'yyyy-MM-dd');
            const { data } = await supabase
                .from('sales_invoices')
                .select('transaction_date, total_amount')
                .eq('status', 'posted')
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate);

            // Group by date
            const days: { date: string; sales: number }[] = [];
            for (let i = 6; i >= 0; i--) {
                const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
                const daySales = data?.filter(d => d.transaction_date === date)
                    .reduce((s, d) => s + d.total_amount, 0) || 0;
                days.push({ date, sales: daySales });
            }
            return days;
        }
    });

    const isLoading = loadingStats || loadingPnL || loadingOrders;

    // Calculate changes
    const revenueChange = prevPnl?.revenue && prevPnl.revenue > 0 && pnl
        ? ((pnl.revenue - prevPnl.revenue) / prevPnl.revenue) * 100 : 0;
    const profitChange = prevPnl?.netProfit && prevPnl.netProfit !== 0 && pnl
        ? ((pnl.netProfit - prevPnl.netProfit) / Math.abs(prevPnl.netProfit)) * 100 : 0;
    const grossMarginPercent = pnl && pnl.revenue > 0
        ? ((pnl.revenue - pnl.cogs) / pnl.revenue) * 100 : 0;

    const ChangeChip = ({ value }: { value: number }) => {
        if (value === 0) return null;
        return (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${value > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {value > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {formatNumber(Math.abs(value))}%
            </span>
        );
    };

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
                    {/* Row 1: Main KPIs */}
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

                    {/* Row 2: Enhanced Financial KPIs */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-indigo-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-indigo-700 flex items-center justify-between">
                                    <span className="flex items-center gap-1"><Percent className="w-4 h-4" />هامش الربح الإجمالي</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-indigo-700">{formatNumber(grossMarginPercent)}%</div>
                                <p className="text-xs text-muted-foreground">إيرادات الشهر - تكلفة البضاعة</p>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-cyan-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-cyan-700 flex items-center gap-1"><Package className="w-4 h-4" />قيمة المخزون</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-cyan-700">{formatCurrency(balanceSheet?.assets.inventory || 0)}</div>
                                <p className="text-xs text-muted-foreground">خام + تعبئة + نصف مصنع + تام</p>
                            </CardContent>
                        </Card>

                        <Card className={`bg-gradient-to-br ${(balanceSheet?.netPosition || 0) >= 0 ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200' : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200'}`}>
                            <CardHeader className="pb-2">
                                <CardTitle className={`text-sm flex items-center gap-1 ${(balanceSheet?.netPosition || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><Scale className="w-4 h-4" />صافي المركز المالي</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${(balanceSheet?.netPosition || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(balanceSheet?.netPosition || 0)}</div>
                                <p className="text-xs text-muted-foreground">أصول - التزامات</p>
                            </CardContent>
                        </Card>

                        {/* Mini Sparkline */}
                        <Card>
                            <CardHeader className="pb-1">
                                <CardTitle className="text-sm text-muted-foreground">مبيعات آخر 7 أيام</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-2">
                                <div className="h-[60px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={sparklineData || []}>
                                            <defs>
                                                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <Tooltip formatter={(v) => formatCurrency(v as number)} labelFormatter={(l) => format(new Date(l as string), 'EEE dd/MM', { locale: arEG })} contentStyle={{ direction: 'rtl', fontSize: '11px' }} />
                                            <Area type="monotone" dataKey="sales" stroke="#3b82f6" fill="url(#sparkGrad)" strokeWidth={2} dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="text-xs text-muted-foreground text-center mt-1">
                                    إجمالي: {formatCurrency(sparklineData?.reduce((s, d) => s + d.sales, 0) || 0)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                        {/* Right Column: Activity Feed */}
                        <ActivityFeed activities={stats?.recent_activities || []} />

                        {/* Left Column */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Financial Summary with MoM Comparison */}
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
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted-foreground">الإيرادات</span>
                                                <ChangeChip value={revenueChange} />
                                            </div>
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
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-muted-foreground">صافي الربح</span>
                                                <ChangeChip value={profitChange} />
                                            </div>
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

                            {/* Orders Breakdown & Quick Actions */}
                            <div className="grid gap-6 md:grid-cols-2">
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
