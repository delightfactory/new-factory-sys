import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BalanceSheetService } from "@/services/BalanceSheetService";
import { FinancialService } from "@/services/FinancialService";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, TrendingUp, TrendingDown, AlertCircle, Award, Target, ArrowRight, DollarSign, Package, Wallet, RotateCw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { Progress } from "@/components/ui/progress";
import { PrintButton } from "@/components/print/PrintLayout";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

export default function ExecutiveAnalytics() {
    const startDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    const prevStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');
    const prevEnd = format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');

    const { data: analytics, isLoading } = useQuery({
        queryKey: ['executive-analytics-enhanced'],
        queryFn: async () => {
            // 1. Products for margins
            const { data: products } = await supabase
                .from('finished_products')
                .select('id, name, sales_price, unit_cost, quantity');

            // 2. Production and Packaging efficiency
            const [prodOrders, pkgOrders] = await Promise.all([
                supabase.from('production_orders').select('id, status'),
                supabase.from('packaging_orders').select('id, status')
            ]);

            const allOrders = [...(prodOrders.data || []), ...(pkgOrders.data || [])];
            const totalOrders = allOrders.length;
            const completedOrders = allOrders.filter(o => o.status === 'completed').length;
            const efficiency = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

            // 3. P&L current month
            const pnl = await FinancialService.getPnLReport(startDate, endDate);
            const prevPnl = await FinancialService.getPnLReport(prevStart, prevEnd);

            // 4. Balance Sheet
            const bs = await BalanceSheetService.getBalanceSheet();

            // 5. Average margin
            const productsWithMargin = (products || []).filter(p => p.sales_price && p.sales_price > 0);
            const avgMarginPercent = productsWithMargin.length > 0
                ? productsWithMargin.reduce((s, p) => s + (((p.sales_price || 0) - (p.unit_cost || 0)) / (p.sales_price || 1)) * 100, 0) / productsWithMargin.length
                : 0;

            // 6. Low margin products
            const lowMarginCount = productsWithMargin.filter(p => {
                const m = ((p.sales_price! - (p.unit_cost || 0)) / p.sales_price!) * 100;
                return m < 15;
            }).length;

            // 7. Inventory turnover (simplified estimate)
            const totalInventoryValue = bs.assets.inventory || 0;
            const cogsMonthly = pnl.cogs || 0;
            const turnoverRate = cogsMonthly > 0 && totalInventoryValue > 0
                ? (cogsMonthly * 12) / totalInventoryValue : 0;

            // 8. Collection rate (based on this month's invoices: paid / total)
            const { data: monthInvoices } = await supabase
                .from('sales_invoices')
                .select('total_amount, paid_amount')
                .eq('status', 'posted')
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate);
            const totalInvoiced = monthInvoices?.reduce((s, i) => s + i.total_amount, 0) || 0;
            const totalPaid = monthInvoices?.reduce((s, i) => s + (i.paid_amount || 0), 0) || 0;
            const collectionRate = totalInvoiced > 0 ? Math.min((totalPaid / totalInvoiced) * 100, 100) : 100;

            // 9. Health Score (weighted)
            const marginScore = Math.min(avgMarginPercent * 2, 30); // max 30 pts
            const efficiencyScore = Math.min(efficiency * 0.3, 30); // max 30 pts
            const grossMarginPct = pnl.revenue > 0 ? ((pnl.revenue - pnl.cogs) / pnl.revenue) * 100 : 0;
            const profitScore = Math.min(Math.max(grossMarginPct, 0), 20); // max 20 pts (based on gross margin %)
            const pricingScore = lowMarginCount === 0 ? 20 : Math.max(0, 20 - lowMarginCount * 2); // max 20 pts
            const healthScore = Math.min(Math.max(Math.round(marginScore + efficiencyScore + profitScore + pricingScore), 0), 100);

            // 10. Revenue change
            const revenueChange = prevPnl.revenue > 0
                ? ((pnl.revenue - prevPnl.revenue) / prevPnl.revenue) * 100 : 0;

            // Top product by margin percentage (not absolute margin)
            const topProduct = [...(products || [])]
                .filter(p => (p.sales_price || 0) > 0)
                .sort((a, b) => {
                    const marginA = ((a.sales_price || 0) - (a.unit_cost || 0)) / (a.sales_price || 1);
                    const marginB = ((b.sales_price || 0) - (b.unit_cost || 0)) / (b.sales_price || 1);
                    return marginB - marginA;
                })[0];

            return {
                healthScore,
                healthLabel: healthScore >= 80 ? 'ممتاز' : healthScore >= 60 ? 'جيد' : healthScore >= 40 ? 'متوسط' : 'يحتاج تحسين',
                healthColor: healthScore >= 80 ? 'text-emerald-600' : healthScore >= 60 ? 'text-blue-600' : healthScore >= 40 ? 'text-amber-600' : 'text-red-600',
                // KPIs
                revenue: pnl.revenue,
                cogs: pnl.cogs,
                expenses: pnl.expenses,
                netProfit: pnl.netProfit,
                revenueChange: Math.round(revenueChange),
                grossMarginPercent: pnl.revenue > 0 ? Math.round(((pnl.revenue - pnl.cogs) / pnl.revenue) * 100) : 0,
                avgMarginPercent: Math.round(avgMarginPercent),
                efficiency: Math.round(efficiency),
                totalInventoryValue,
                netPosition: bs.netPosition || 0,
                turnoverRate: Math.round(turnoverRate * 10) / 10,
                collectionRate: Math.round(collectionRate),
                lowMarginCount,
                topProduct,
                // Recommendations data
                productCount: products?.length || 0,
            };
        }
    });

    const ChangeIndicator = ({ value, suffix = '%' }: { value: number; suffix?: string }) => {
        if (value === 0) return null;
        return (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${value > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {value > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {formatNumber(Math.abs(value))}{suffix}
            </span>
        );
    };

    return (
        <div className="space-y-6 print:space-y-4">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader title="تحليلات تنفيذية" description="ملخص شامل لأداء المصنع مع تقييم صحة المصنع والتوصيات" icon={Activity} />
                </div>
                <PrintButton label="طباعة التقرير" />
            </div>

            {isLoading ? <CardGridSkeleton count={4} /> : (
                <div className="space-y-6">
                    {/* Health Score + KPIs Row */}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                        {/* Health Score */}
                        <Card className="lg:col-span-3 border-primary/20 bg-gradient-to-br from-background to-primary/5">
                            <CardHeader className="pb-4">
                                <CardTitle className="flex items-center gap-2 text-xl"><Activity className="w-6 h-6 text-primary" />مؤشر صحة المصنع</CardTitle>
                                <CardDescription>تقييم شامل بناءً على الربحية والكفاءة وسلامة المخزون والتسعير</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col items-center justify-center py-6">
                                <div className="relative flex items-center justify-center w-44 h-44 rounded-full border-8 border-muted">
                                    <div className="text-center">
                                        <span className={`text-5xl font-black ${analytics?.healthColor}`}>{analytics?.healthScore}</span>
                                        <span className="text-xl text-muted-foreground">/100</span>
                                    </div>
                                </div>
                                <div className="mt-4 w-full space-y-2">
                                    <div className="flex justify-between text-sm font-medium">
                                        <span>الحالة العامة</span>
                                        <span className={analytics?.healthColor}>{analytics?.healthLabel}</span>
                                    </div>
                                    <Progress value={analytics?.healthScore} className="h-2" />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Key Metrics */}
                        <div className="lg:col-span-4 grid gap-4 grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-muted-foreground flex items-center justify-between">
                                        إيرادات الشهر
                                        <ChangeIndicator value={analytics?.revenueChange || 0} />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-blue-700">{formatCurrency(analytics?.revenue || 0)}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">هامش الربح الإجمالي</CardTitle></CardHeader>
                                <CardContent>
                                    <div className={`text-2xl font-bold ${(analytics?.grossMarginPercent || 0) >= 20 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                        {analytics?.grossMarginPercent}%
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" />كفاءة التشغيل</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold text-blue-700">{analytics?.efficiency}%</div>
                                    <p className="text-xs text-muted-foreground">نسبة الأوامر المكتملة</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><RotateCw className="w-3 h-3" />معدل دوران المخزون</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">{analytics?.turnoverRate}x</div>
                                    <p className="text-xs text-muted-foreground">سنوياً (تقديري)</p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Financial Summary Row */}
                    <div className="grid gap-4 md:grid-cols-5">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />صافي الربح</CardTitle></CardHeader>
                            <CardContent>
                                <div className={`text-xl font-bold ${(analytics?.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(analytics?.netProfit || 0)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Package className="w-3 h-3" />قيمة المخزون</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold">{formatCurrency(analytics?.totalInventoryValue || 0)}</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" />المركز المالي</CardTitle></CardHeader>
                            <CardContent>
                                <div className={`text-xl font-bold ${(analytics?.netPosition || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(analytics?.netPosition || 0)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />نسبة التحصيل</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold text-purple-700">{analytics?.collectionRate}%</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">متوسط هامش المنتجات</CardTitle></CardHeader>
                            <CardContent><div className={`text-xl font-bold ${(analytics?.avgMarginPercent || 0) >= 20 ? 'text-emerald-700' : 'text-amber-700'}`}>{analytics?.avgMarginPercent}%</div></CardContent>
                        </Card>
                    </div>

                    {/* Top Product + Recommendations */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Top Product */}
                        <Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-amber-800 flex items-center gap-2"><Award className="w-4 h-4" />المنتج الذهبي (الأكثر ربحية)</CardTitle>
                            </CardHeader>
                            <CardContent className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold text-amber-900">{analytics?.topProduct?.name || '---'}</div>
                                    <p className="text-xs text-amber-700">
                                        هامش: {formatCurrency((analytics?.topProduct?.sales_price || 0) - (analytics?.topProduct?.unit_cost || 0))} / وحدة
                                    </p>
                                </div>
                                <Badge className="bg-amber-500 text-white hover:bg-amber-600">Top Performer</Badge>
                            </CardContent>
                        </Card>

                        {/* Smart Recommendations */}
                        <Card className="border-l-4 border-l-blue-500">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-blue-500" />توصيات النظام</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {analytics?.efficiency! < 90 && (
                                    <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-900/20 rounded text-sm">
                                        <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                        <span>كفاءة التشغيل {analytics?.efficiency}% — يُنصح بمراجعة أوامر الإنتاج المعلقة</span>
                                    </div>
                                )}
                                {analytics?.avgMarginPercent! < 20 && (
                                    <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-900/20 rounded text-sm">
                                        <DollarSign className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>متوسط الهامش {analytics?.avgMarginPercent}% — مراجعة <Link to="/reports/pricing-analysis" className="underline text-blue-600">تحليل التسعير</Link></span>
                                    </div>
                                )}
                                {analytics?.lowMarginCount! > 0 && (
                                    <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-900/20 rounded text-sm">
                                        <TrendingDown className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                        <span>{analytics?.lowMarginCount} منتج بهامش أقل من 15% — <Link to="/reports/pricing-analysis" className="underline text-blue-600">عرض التفاصيل</Link></span>
                                    </div>
                                )}
                                {(analytics?.collectionRate || 100) < 80 && (
                                    <div className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-900/20 rounded text-sm">
                                        <Users className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                                        <span>نسبة التحصيل {analytics?.collectionRate}% — مراجعة <Link to="/reports/aging" className="underline text-blue-600">أعمار الديون</Link></span>
                                    </div>
                                )}
                                {analytics?.healthScore! >= 80 && (
                                    <div className="flex items-start gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded text-sm text-emerald-700">
                                        <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <span>أداء المصنع ممتاز! استمر في المتابعة عبر <Link to="/reports/trends" className="underline">تحليل الاتجاهات</Link></span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
