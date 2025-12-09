import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FinancialService } from "@/services/FinancialService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";

export default function FinancialReports() {
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    const { data: pnl, isLoading } = useQuery({
        queryKey: ['pnl_report', dateRange],
        queryFn: () => FinancialService.getPnLReport(dateRange.start, dateRange.end)
    });

    const currencyFormatter = (value: number) =>
        new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(value);

    // Filter/Presets
    const setPreset = (type: 'thisMonth' | 'lastMonth' | 'thisYear') => {
        const today = new Date();
        if (type === 'thisMonth') {
            setDateRange({ start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') });
        } else if (type === 'lastMonth') {
            const last = subMonths(today, 1);
            setDateRange({ start: format(startOfMonth(last), 'yyyy-MM-dd'), end: format(endOfMonth(last), 'yyyy-MM-dd') });
        } else if (type === 'thisYear') {
            setDateRange({ start: format(new Date(today.getFullYear(), 0, 1), 'yyyy-MM-dd'), end: format(new Date(today.getFullYear(), 11, 31), 'yyyy-MM-dd') });
        }
    };

    if (isLoading) return (
        <div className="space-y-6">
            <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            <CardGridSkeleton count={4} />
        </div>
    );

    const chartData = [
        { name: 'الإيرادات', amount: pnl?.revenue || 0, fill: '#10b981' },
        { name: 'ت.البضاعة', amount: pnl?.cogs || 0, fill: '#f59e0b' },
        { name: 'إ.الربح', amount: pnl?.grossProfit || 0, fill: '#3b82f6' },
        { name: 'م.تشغيل', amount: pnl?.expenses || 0, fill: '#ef4444' },
        { name: 'الصافي', amount: pnl?.netProfit || 0, fill: (pnl?.netProfit || 0) >= 0 ? '#10b981' : '#dc2626' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">التقارير المالية (P&L)</h2>
                    <p className="text-muted-foreground">قائمة الدخل: الإيرادات، التكاليف، والأرباح.</p>
                </div>

                <div className="flex items-end gap-2">
                    <div className="grid gap-1.5 code">
                        <Label>من</Label>
                        <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[140px]" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>إلى</Label>
                        <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[140px]" />
                    </div>
                    <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setPreset('thisMonth')}>الشهر الحالي</Button>
                        <Button variant="outline" size="sm" onClick={() => setPreset('lastMonth')}>الشهر الماضي</Button>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالي الإيرادات (Sales)</CardTitle>
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currencyFormatter(pnl?.revenue || 0)}</div>
                        <p className="text-xs text-muted-foreground">فواتير البيع المعتمدة</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">تكلفة البضاعة (COGS)</CardTitle>
                        <Activity className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{currencyFormatter(pnl?.cogs || 0)}</div>
                        <p className="text-xs text-muted-foreground">تكلفة المخزون المباع</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">مجمل الربح (Gross)</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{currencyFormatter(pnl?.grossProfit || 0)}</div>
                        <p className="text-xs text-muted-foreground">الإيراد - التكلفة المباشرة</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">صافي الربح (Net)</CardTitle>
                        {(pnl?.netProfit || 0) >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${(pnl?.netProfit || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {currencyFormatter(pnl?.netProfit || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">بعد خصم المصاريف ({currencyFormatter(pnl?.expenses || 0)})</p>
                    </CardContent>
                </Card>
            </div>

            {/* Analysis Charts */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>تحليل الأداء المالي</CardTitle>
                        <CardDescription>مقارنة بين الإيرادات، التكاليف، والأرباح.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => currencyFormatter(value as number)} />
                                    <Bar dataKey="amount" fill="#8884d8" radius={[4, 4, 0, 0]} barSize={50} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>هوامش الربحية</CardTitle>
                        <CardDescription>نسب الربح من إجمالي المبيعات.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>هامش مجمل الربح (Gross Margin)</span>
                                <span className="font-bold">{pnl?.revenue ? ((pnl.grossProfit / pnl.revenue) * 100).toFixed(1) : 0}%</span>
                            </div>
                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${pnl?.revenue ? Math.min((pnl.grossProfit / pnl.revenue) * 100, 100) : 0}%` }} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>نسبة التكاليف (COGS %)</span>
                                <span className="font-bold">{pnl?.revenue ? ((pnl.cogs / pnl.revenue) * 100).toFixed(1) : 0}%</span>
                            </div>
                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500" style={{ width: `${pnl?.revenue ? Math.min((pnl.cogs / pnl.revenue) * 100, 100) : 0}%` }} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>هامش صافي الربح (Net Margin)</span>
                                <span className="font-bold">{pnl?.revenue ? ((pnl.netProfit / pnl.revenue) * 100).toFixed(1) : 0}%</span>
                            </div>
                            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                <div className={`h-full ${(pnl?.netProfit || 0) >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pnl?.revenue ? Math.min(Math.abs(pnl.netProfit / pnl.revenue) * 100, 100) : 0}%` }} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
