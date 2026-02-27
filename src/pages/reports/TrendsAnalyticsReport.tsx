import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell
} from "recharts";
import { format, subDays } from "date-fns";
import { arEG } from "date-fns/locale";

type Period = '7d' | '30d' | '90d' | '6m' | '1y';

export default function TrendsAnalyticsReport() {
    const [period, setPeriod] = useState<Period>('30d');

    const getDaysCount = (p: Period) => {
        switch (p) {
            case '7d': return 7;
            case '30d': return 30;
            case '90d': return 90;
            case '6m': return 180;
            case '1y': return 365;
        }
    };

    const { data, isLoading } = useQuery({
        queryKey: ['trends-analytics', period],
        queryFn: async () => {
            const days = getDaysCount(period);
            const dates: string[] = [];
            for (let i = days - 1; i >= 0; i--) {
                dates.push(format(subDays(new Date(), i), 'yyyy-MM-dd'));
            }

            const startDate = dates[0];
            const endDate = dates[dates.length - 1];

            // Categories that are NOT operating expenses (supplier payments, transfers)
            const excludeExpenseCategories = ['payment', 'purchase_payment', 'سداد مورد', 'transfer', 'تحويل'];

            // Fetch sales, COGS (from invoice items), purchases, and expenses
            // Note: payroll is captured through financial_transactions (category: salary/رواتب)
            const [salesRes, cogsRes, purchasesRes, expensesRes] = await Promise.all([
                supabase.from('sales_invoices').select('transaction_date, total_amount').eq('status', 'posted')
                    .gte('transaction_date', startDate).lte('transaction_date', endDate),
                // COGS: actual cost of goods sold (not purchases!)
                supabase.from('sales_invoice_items')
                    .select('quantity, unit_cost_at_sale, sales_invoices!inner(transaction_date, status)')
                    .eq('sales_invoices.status', 'posted')
                    .gte('sales_invoices.transaction_date', startDate)
                    .lte('sales_invoices.transaction_date', endDate),
                supabase.from('purchase_invoices').select('transaction_date, total_amount').eq('status', 'posted')
                    .gte('transaction_date', startDate).lte('transaction_date', endDate),
                supabase.from('financial_transactions').select('transaction_date, amount, category').eq('transaction_type', 'expense')
                    .gte('transaction_date', startDate).lte('transaction_date', endDate)
            ]);

            // Filter out supplier payment categories from expenses to avoid double-counting with COGS
            const filteredExpenses = (expensesRes.data || []).filter((e: any) =>
                !excludeExpenseCategories.some(cat => (e.category || '').toLowerCase().includes(cat.toLowerCase()))
            );

            const daily = dates.map(date => {
                const daySales = salesRes.data?.filter(s => s.transaction_date === date)
                    .reduce((sum, s) => sum + s.total_amount, 0) || 0;
                // COGS per day from actual cost at sale
                const dayCogs = cogsRes.data?.filter((c: any) => c.sales_invoices?.transaction_date === date)
                    .reduce((sum, c: any) => sum + (c.quantity * (c.unit_cost_at_sale || 0)), 0) || 0;
                const dayPurchases = purchasesRes.data?.filter(p => p.transaction_date === date)
                    .reduce((sum, p) => sum + p.total_amount, 0) || 0;
                // Only real operating expenses (NOT supplier payments)
                const dayExpenses = filteredExpenses.filter((e: any) => e.transaction_date === date)
                    .reduce((sum: number, e: any) => sum + e.amount, 0) || 0;
                // Profit = Revenue - COGS - Operating Expenses (includes salary/payroll)
                return { date, sales: daySales, cogs: dayCogs, purchases: dayPurchases, expenses: dayExpenses, profit: daySales - dayCogs - dayExpenses };
            });

            const monthlyMap = new Map<string, { sales: number; cogs: number; purchases: number; expenses: number; profit: number }>();
            daily.forEach(d => {
                const monthKey = d.date.substring(0, 7);
                const existing = monthlyMap.get(monthKey) || { sales: 0, cogs: 0, purchases: 0, expenses: 0, profit: 0 };
                existing.sales += d.sales;
                existing.cogs += d.cogs;
                existing.purchases += d.purchases;
                existing.expenses += d.expenses;
                existing.profit += d.profit;
                monthlyMap.set(monthKey, existing);
            });

            const monthly = Array.from(monthlyMap.entries()).map(([month, data]) => ({ date: month, ...data }));

            const totalSales = daily.reduce((s, d) => s + d.sales, 0);
            const totalCogs = daily.reduce((s, d) => s + d.cogs, 0);
            const totalPurchases = daily.reduce((s, d) => s + d.purchases, 0);
            const totalExpenses = daily.reduce((s, d) => s + d.expenses, 0);
            const totalProfit = totalSales - totalCogs - totalExpenses;

            const prevStartDate = format(subDays(new Date(startDate), days), 'yyyy-MM-dd');
            const [prevSales, prevPurchases] = await Promise.all([
                supabase.from('sales_invoices').select('total_amount').eq('status', 'posted')
                    .gte('transaction_date', prevStartDate).lt('transaction_date', startDate),
                supabase.from('purchase_invoices').select('total_amount').eq('status', 'posted')
                    .gte('transaction_date', prevStartDate).lt('transaction_date', startDate),
            ]);

            const prevTotalSales = prevSales.data?.reduce((s, d) => s + d.total_amount, 0) || 0;
            const prevTotalPurchases = prevPurchases.data?.reduce((s, d) => s + d.total_amount, 0) || 0;

            return {
                daily, monthly, totalSales, totalCogs, totalPurchases, totalExpenses, totalProfit,
                salesChange: prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : 0,
                purchasesChange: prevTotalPurchases > 0 ? ((totalPurchases - prevTotalPurchases) / prevTotalPurchases) * 100 : 0
            };
        }
    });

    const showMonthly = period === '6m' || period === '1y';
    const chartData = showMonthly ? data?.monthly : data?.daily;

    const formatDate = (date: string) => {
        if (showMonthly) return format(new Date(date + '-01'), 'MMM yyyy', { locale: arEG });
        if (period === '7d') return format(new Date(date), 'EEE dd', { locale: arEG });
        return format(new Date(date), 'dd/MM');
    };

    const ChangeIndicator = ({ value }: { value: number }) => (
        <div className={`flex items-center gap-1 text-xs ${value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatNumber(Math.abs(value))}%
        </div>
    );

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader title="تحليل الاتجاهات" description="رسوم بيانية تفاعلية للمبيعات والمشتريات والمصروفات والأرباح" icon={BarChart3} />
                </div>
                <div className="flex gap-2 items-center">
                    <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">أسبوع</SelectItem>
                            <SelectItem value="30d">شهر</SelectItem>
                            <SelectItem value="90d">3 شهور</SelectItem>
                            <SelectItem value="6m">6 شهور</SelectItem>
                            <SelectItem value="1y">سنة</SelectItem>
                        </SelectContent>
                    </Select>
                    <PrintButton />
                </div>
            </div>

            {isLoading ? <CardGridSkeleton count={4} /> : (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-blue-700 flex items-center justify-between">إجمالي المبيعات <ChangeIndicator value={data?.salesChange || 0} /></CardTitle>
                            </CardHeader>
                            <CardContent><div className="text-xl font-bold text-blue-700">{formatCurrency(data?.totalSales || 0)}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-orange-700 flex items-center justify-between">إجمالي المشتريات <ChangeIndicator value={data?.purchasesChange || 0} /></CardTitle>
                            </CardHeader>
                            <CardContent><div className="text-xl font-bold text-orange-700">{formatCurrency(data?.totalPurchases || 0)}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">إجمالي المصروفات</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold text-red-700">{formatCurrency(data?.totalExpenses || 0)}</div></CardContent>
                        </Card>
                        <Card className={`bg-gradient-to-br ${(data?.totalProfit || 0) >= 0 ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200' : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200'}`}>
                            <CardHeader className="pb-2"><CardTitle className={`text-sm ${(data?.totalProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>صافي الربح</CardTitle></CardHeader>
                            <CardContent><div className={`text-xl font-bold ${(data?.totalProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(data?.totalProfit || 0)}</div></CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader><CardTitle>اتجاه المبيعات والمشتريات</CardTitle><CardDescription>{showMonthly ? 'تجميع شهري' : 'بيانات يومية'}</CardDescription></CardHeader>
                        <CardContent>
                            <div className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                            <linearGradient id="purchasesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={formatDate} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} width={50} />
                                        <Tooltip formatter={(v) => formatCurrency(v as number)} labelFormatter={(l) => formatDate(l as string)} contentStyle={{ direction: 'rtl' }} />
                                        <Legend />
                                        <Area type="monotone" dataKey="sales" name="المبيعات" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="purchases" name="المشتريات" stroke="#f97316" fill="url(#purchasesGrad)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                            <CardHeader><CardTitle>صافي الربح</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={formatDate} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} width={45} />
                                            <Tooltip formatter={(v) => formatCurrency(v as number)} labelFormatter={(l) => formatDate(l as string)} contentStyle={{ direction: 'rtl' }} />
                                            <Bar dataKey="profit" name="الربح" radius={[4, 4, 0, 0]}>
                                                {chartData?.map((entry, index) => (
                                                    <Cell key={index} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>المصروفات</CardTitle></CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={formatDate} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} width={45} />
                                            <Tooltip formatter={(v) => formatCurrency(v as number)} labelFormatter={(l) => formatDate(l as string)} contentStyle={{ direction: 'rtl' }} />
                                            <Bar dataKey="expenses" name="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
