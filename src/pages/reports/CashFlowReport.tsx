import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Banknote, TrendingUp, TrendingDown, ArrowDownRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { arEG } from "date-fns/locale";

type Period = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear' | 'custom';

export default function CashFlowReport() {
    const [period, setPeriod] = useState<Period>('thisMonth');
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const handlePeriodChange = (newPeriod: Period) => {
        setPeriod(newPeriod);
        const now = new Date();
        switch (newPeriod) {
            case 'thisMonth':
                setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'lastMonth':
                setStartDate(format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd'));
                break;
            case 'last3Months':
                setStartDate(format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'last6Months':
                setStartDate(format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'thisYear':
                setStartDate(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
        }
    };

    const { data, isLoading } = useQuery({
        queryKey: ['cash-flow-report', startDate, endDate],
        queryFn: async () => {
            const [salesIncome, purchasePayments, expenses] = await Promise.all([
                // Cash collected from sales invoices (paid_amount = actual cash received)
                supabase.from('sales_invoices').select('transaction_date, total_amount, paid_amount')
                    .eq('status', 'posted').gte('transaction_date', startDate).lte('transaction_date', endDate),
                // Cash paid for purchases (paid_amount = actual cash paid to suppliers)
                supabase.from('purchase_invoices').select('transaction_date, total_amount, paid_amount')
                    .eq('status', 'posted').gte('transaction_date', startDate).lte('transaction_date', endDate),
                // Operating expenses from financial_transactions (includes salary/payroll)
                supabase.from('financial_transactions').select('transaction_date, amount, category, transaction_type')
                    .gte('transaction_date', startDate).lte('transaction_date', endDate),
            ]);

            // === OPERATING INFLOWS ===
            // Cash from sales invoices (what was actually collected)
            const totalSalesIncome = salesIncome.data?.reduce((s, i) => s + (i.paid_amount || 0), 0) || 0;
            // Other income from financial_transactions (manual income entries NOT tied to invoices)
            const otherIncomeEntries = (expenses.data || []).filter(e => e.transaction_type === 'income');
            const totalOtherIncome = otherIncomeEntries.reduce((s, e) => s + e.amount, 0);

            // === OPERATING OUTFLOWS ===
            // Cash paid for purchases (raw materials, packaging = OPERATING, not investing)
            const totalPurchasePayments = purchasePayments.data?.reduce((s, i) => s + (i.paid_amount || 0), 0) || 0;
            // Note: Payroll/salary expenses are already included in financial_transactions
            const totalPayroll = 0; // Kept for UI display separation if needed

            // Expense transactions (exclude transfers AND supplier payments to avoid double-counting)
            const excludeCategories = ['transfer', 'تحويل', 'payment', 'purchase_payment', 'سداد مورد'];
            const operatingExpenses = (expenses.data || []).filter(e =>
                e.transaction_type === 'expense' &&
                !excludeCategories.some(c => (e.category || '').toLowerCase().includes(c.toLowerCase()))
            );
            const totalOperatingExpenses = operatingExpenses.reduce((s, e) => s + e.amount, 0);

            // Categorize expenses for breakdown
            const expenseCategories = new Map<string, number>();
            operatingExpenses.forEach(e => {
                const cat = e.category || 'أخرى';
                expenseCategories.set(cat, (expenseCategories.get(cat) || 0) + e.amount);
            });
            if (totalPayroll > 0) {
                expenseCategories.set('رواتب وأجور', (expenseCategories.get('رواتب وأجور') || 0) + totalPayroll);
            }

            const expenseBreakdown = Array.from(expenseCategories.entries())
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount);

            // Operating Cash Flow
            const operatingInflows = totalSalesIncome + totalOtherIncome;
            const operatingOutflows = totalPurchasePayments + totalOperatingExpenses + totalPayroll;
            const operatingCashFlow = operatingInflows - operatingOutflows;

            // Net Cash Flow (no investing section for now — purchases are operating)
            const netCashFlow = operatingCashFlow;

            // === Monthly breakdown for chart ===
            const monthlyMap = new Map<string, { inflows: number; outflows: number; net: number }>();

            // Add sales income per month
            salesIncome.data?.forEach(s => {
                const monthKey = s.transaction_date.substring(0, 7);
                const existing = monthlyMap.get(monthKey) || { inflows: 0, outflows: 0, net: 0 };
                existing.inflows += (s.paid_amount || 0);
                monthlyMap.set(monthKey, existing);
            });

            // Add other income per month
            otherIncomeEntries.forEach(t => {
                const monthKey = t.transaction_date.substring(0, 7);
                const existing = monthlyMap.get(monthKey) || { inflows: 0, outflows: 0, net: 0 };
                existing.inflows += t.amount;
                monthlyMap.set(monthKey, existing);
            });

            // Add purchase payments per month
            purchasePayments.data?.forEach(p => {
                const monthKey = p.transaction_date.substring(0, 7);
                const existing = monthlyMap.get(monthKey) || { inflows: 0, outflows: 0, net: 0 };
                existing.outflows += (p.paid_amount || 0);
                monthlyMap.set(monthKey, existing);
            });

            // Add expense transactions per month
            operatingExpenses.forEach(t => {
                const monthKey = t.transaction_date.substring(0, 7);
                const existing = monthlyMap.get(monthKey) || { inflows: 0, outflows: 0, net: 0 };
                existing.outflows += t.amount;
                monthlyMap.set(monthKey, existing);
            });


            // Calculate net for each month
            monthlyMap.forEach((val) => { val.net = val.inflows - val.outflows; });

            const monthlyData = Array.from(monthlyMap.entries())
                .map(([month, data]) => ({ month, ...data }))
                .sort((a, b) => a.month.localeCompare(b.month));

            return {
                operatingInflows, operatingOutflows, operatingCashFlow,
                netCashFlow,
                totalSalesIncome, totalOtherIncome, totalPurchasePayments,
                totalOperatingExpenses, totalPayroll,
                expenseBreakdown, monthlyData
            };
        }
    });

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader title="التدفقات النقدية" description="تحليل حركة النقد: تدفقات تشغيلية واستثمارية" icon={Banknote} />
                </div>
                <div className="flex gap-2 items-center">
                    <Select value={period} onValueChange={(v) => handlePeriodChange(v as Period)}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="thisMonth">هذا الشهر</SelectItem>
                            <SelectItem value="lastMonth">الشهر الماضي</SelectItem>
                            <SelectItem value="last3Months">آخر 3 شهور</SelectItem>
                            <SelectItem value="last6Months">آخر 6 شهور</SelectItem>
                            <SelectItem value="thisYear">هذه السنة</SelectItem>
                            <SelectItem value="custom">فترة مخصصة</SelectItem>
                        </SelectContent>
                    </Select>
                    {period === 'custom' && (
                        <div className="flex gap-2 items-center">
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-[140px]" />
                            <span className="text-sm">إلى</span>
                            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-[140px]" />
                        </div>
                    )}
                    <PrintButton />
                </div>
            </div>

            {isLoading ? <CardGridSkeleton count={3} /> : (
                <div className="space-y-6">
                    {/* Net Cash Flow */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700 flex items-center gap-1"><ArrowDownRight className="w-4 h-4" />التدفقات التشغيلية</CardTitle></CardHeader>
                            <CardContent>
                                <div className={`text-xl font-bold ${(data?.operatingCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(data?.operatingCashFlow || 0)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className={`bg-gradient-to-br ${(data?.netCashFlow || 0) >= 0 ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200' : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200'}`}>
                            <CardHeader className="pb-2"><CardTitle className={`text-sm ${(data?.netCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>صافي التدفق النقدي</CardTitle></CardHeader>
                            <CardContent>
                                <div className={`text-xl font-bold ${(data?.netCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(data?.netCashFlow || 0)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Cash Flow Statement */}
                    <Card>
                        <CardHeader><CardTitle>قائمة التدفقات النقدية</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            {/* Operating */}
                            <div>
                                <h3 className="font-bold text-lg mb-3 text-blue-700 flex items-center gap-2"><ArrowDownRight className="w-5 h-5" />أنشطة تشغيلية</h3>
                                <div className="space-y-2 mr-6">
                                    <div className="flex justify-between p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg">
                                        <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" />إيرادات المبيعات (المحصل)</span>
                                        <span className="font-mono font-bold text-emerald-600">{formatCurrency(data?.totalSalesIncome || 0)}</span>
                                    </div>
                                    {(data?.totalOtherIncome || 0) > 0 && (
                                        <div className="flex justify-between p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg">
                                            <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" />إيرادات أخرى</span>
                                            <span className="font-mono font-bold text-emerald-600">{formatCurrency(data?.totalOtherIncome || 0)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between p-3 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                        <span className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />مدفوعات الموردين (مشتريات)</span>
                                        <span className="font-mono font-bold text-red-600">({formatCurrency(data?.totalPurchasePayments || 0)})</span>
                                    </div>
                                    <div className="flex justify-between p-3 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                        <span className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />مصروفات تشغيلية</span>
                                        <span className="font-mono font-bold text-red-600">({formatCurrency(data?.totalOperatingExpenses || 0)})</span>
                                    </div>
                                    {(data?.totalPayroll || 0) > 0 && (
                                        <div className="flex justify-between p-3 bg-red-50/50 dark:bg-red-900/10 rounded-lg">
                                            <span className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />رواتب وأجور</span>
                                            <span className="font-mono font-bold text-red-600">({formatCurrency(data?.totalPayroll || 0)})</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between p-3 border-t-2 font-bold text-lg">
                                        <span>صافي التدفق التشغيلي</span>
                                        <span className={`font-mono ${(data?.operatingCashFlow || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(data?.operatingCashFlow || 0)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Net */}
                            <div className={`p-4 rounded-lg border-2 ${(data?.netCashFlow || 0) >= 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20' : 'bg-red-50 border-red-200 dark:bg-red-900/20'}`}>
                                <div className="flex justify-between items-center text-xl font-bold">
                                    <span>صافي التدفق النقدي</span>
                                    <span className={`font-mono ${(data?.netCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(data?.netCashFlow || 0)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Charts */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Monthly trend */}
                        {data?.monthlyData && data.monthlyData.length > 1 && (
                            <Card>
                                <CardHeader><CardTitle>التدفقات الشهرية</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="h-[280px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.monthlyData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => format(new Date(v + '-01'), 'MMM', { locale: arEG })} />
                                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${formatNumber(v / 1000)}k`} width={45} />
                                                <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ direction: 'rtl' }} />
                                                <Legend />
                                                <Bar dataKey="inflows" name="التدفقات الداخلة" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="outflows" name="التدفقات الخارجة" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Expense Breakdown */}
                        <Card>
                            <CardHeader><CardTitle>تفصيل المصروفات التشغيلية</CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {data?.expenseBreakdown.map((cat) => (
                                        <div key={cat.name} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                            <span className="text-sm">{cat.name}</span>
                                            <span className="font-mono text-sm font-bold">{formatCurrency(cat.amount)}</span>
                                        </div>
                                    ))}
                                    {(!data?.expenseBreakdown || data.expenseBreakdown.length === 0) && (
                                        <p className="text-center text-muted-foreground py-4">لا توجد مصروفات تشغيلية</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}
