import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Download,
    Wallet,
    TrendingDown,
    Calendar,
    PieChart as PieChartIcon,
    ArrowUpDown,
    Filter
} from "lucide-react";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { arEG } from "date-fns/locale";

interface ExpenseItem {
    id: number;
    amount: number;
    category: string;
    description: string;
    transaction_date: string;
    treasury?: { name: string };
}

interface CategoryStats {
    name: string;
    total: number;
    count: number;
    percentage: number;
    color: string;
}

// Colors for categories
const CATEGORY_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
];

type Period = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'thisYear' | 'custom';

// Categories to exclude by default (transfers and payments)
const EXCLUDED_CATEGORIES = ['transfer', 'payment', 'purchase_payment', 'تحويل', 'سداد مورد'];
const PAYMENT_CATEGORIES = ['payment', 'purchase_payment', 'سداد مورد'];
const TRANSFER_CATEGORIES = ['transfer', 'تحويل'];

export default function ExpenseAnalysisReport() {
    const [period, setPeriod] = useState<Period>('thisMonth');
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [sortBy, setSortBy] = useState<'total' | 'count'>('total');

    // Filter controls - expenses only by default
    const [showExpensesOnly, setShowExpensesOnly] = useState(true);
    const [includePayments, setIncludePayments] = useState(false);
    const [includeTransfers, setIncludeTransfers] = useState(false);

    // Update dates based on period
    const handlePeriodChange = (newPeriod: Period) => {
        setPeriod(newPeriod);
        const now = new Date();

        switch (newPeriod) {
            case 'thisMonth':
                setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
                break;
            case 'lastMonth':
                const lastMonth = subMonths(now, 1);
                setStartDate(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
                setEndDate(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
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

    // Fetch expenses data
    const { data: expenses, isLoading } = useQuery({
        queryKey: ['expense-analysis', startDate, endDate, showExpensesOnly, includePayments, includeTransfers],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('id, amount, category, description, transaction_date, treasury:treasury_id(name)')
                .eq('transaction_type', 'expense')
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate)
                .order('transaction_date', { ascending: false });

            if (error) throw error;

            // Filter based on selected options
            let filteredData = data || [];

            if (showExpensesOnly) {
                // Start with no exclusions
                let excludeList: string[] = [];

                // Exclude payments unless explicitly included
                if (!includePayments) {
                    excludeList = [...excludeList, ...PAYMENT_CATEGORIES];
                }

                // Exclude transfers unless explicitly included
                if (!includeTransfers) {
                    excludeList = [...excludeList, ...TRANSFER_CATEGORIES];
                }

                filteredData = filteredData.filter((item: any) => {
                    const cat = (item.category || '').toLowerCase();
                    return !excludeList.some(exc => cat.includes(exc.toLowerCase()));
                });
            }

            // Transform treasury from array to single object
            return filteredData.map((item: any) => ({
                ...item,
                treasury: item.treasury?.[0] || undefined
            })) as ExpenseItem[];
        }
    });

    // Process statistics
    const stats = useMemo(() => {
        if (!expenses || expenses.length === 0) return null;

        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

        // Group by category
        const categoryMap = new Map<string, { total: number; count: number }>();
        expenses.forEach(expense => {
            const cat = expense.category || 'غير مصنف';
            const existing = categoryMap.get(cat) || { total: 0, count: 0 };
            categoryMap.set(cat, {
                total: existing.total + expense.amount,
                count: existing.count + 1
            });
        });

        // Convert to array with percentages
        const categories: CategoryStats[] = Array.from(categoryMap.entries())
            .map(([name, data], index) => ({
                name,
                total: data.total,
                count: data.count,
                percentage: (data.total / totalExpenses) * 100,
                color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
            }))
            .sort((a, b) => sortBy === 'total' ? b.total - a.total : b.count - a.count);

        // Daily breakdown for trend chart
        const dailyMap = new Map<string, number>();
        expenses.forEach(expense => {
            const date = expense.transaction_date;
            dailyMap.set(date, (dailyMap.get(date) || 0) + expense.amount);
        });

        const dailyData = Array.from(dailyMap.entries())
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Top 5 individual expenses
        const topExpenses = [...expenses]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);

        return {
            totalExpenses,
            totalCount: expenses.length,
            avgExpense: totalExpenses / expenses.length,
            categories,
            dailyData,
            topExpenses
        };
    }, [expenses, sortBy]);

    if (isLoading) return <CardGridSkeleton count={4} />;

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
                <PageHeader
                    title="تحليل المصروفات"
                    description="تحليل تفصيلي للمصروفات حسب الفئةونسبة كل بند"
                    icon={Wallet}
                />
                <div className="flex gap-2">
                    <PrintButton />
                    <Button>
                        <Download className="w-4 h-4 ml-2" />
                        تصدير
                    </Button>
                </div>
            </div>

            {/* Period Filter */}
            <Card className="print:hidden">
                <CardContent className="pt-4">
                    <div className="flex flex-col gap-4">
                        {/* Period Selection */}
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">الفترة:</span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <Select value={period} onValueChange={(v) => handlePeriodChange(v as Period)}>
                                    <SelectTrigger className="w-[160px]">
                                        <SelectValue placeholder="اختر الفترة" />
                                    </SelectTrigger>
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
                                    <>
                                        <Input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-[150px]"
                                        />
                                        <span className="self-center">إلى</span>
                                        <Input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-[150px]"
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Type Filter */}
                        <div className="flex flex-col gap-3 md:flex-row md:items-center border-t pt-3">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">عرض:</span>
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showExpensesOnly}
                                        onChange={(e) => setShowExpensesOnly(e.target.checked)}
                                        className="rounded border-gray-300"
                                    />
                                    <span className="text-sm">مصروفات فقط</span>
                                </label>
                                {showExpensesOnly && (
                                    <>
                                        <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-2 py-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={includePayments}
                                                onChange={(e) => setIncludePayments(e.target.checked)}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm">+ مدفوعات الموردين</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer bg-muted/50 px-2 py-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={includeTransfers}
                                                onChange={(e) => setIncludeTransfers(e.target.checked)}
                                                className="rounded border-gray-300"
                                            />
                                            <span className="text-sm">+ التحويلات</span>
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">
                            إجمالي المصروفات
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                            <TrendingDown className="w-5 h-5" />
                            {formatCurrency(stats?.totalExpenses || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">عدد المعاملات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold">{stats?.totalCount || 0}</div>
                        <p className="text-xs text-muted-foreground">معاملة مصروف</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">متوسط المصروف</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold">
                            {formatCurrency(stats?.avgExpense || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">لكل معاملة</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">عدد الفئات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-purple-600">
                            {stats?.categories.length || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">فئة مصروفات</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Pie Chart - Distribution by Category */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieChartIcon className="w-5 h-5" />
                            توزيع المصروفات حسب الفئة
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats?.categories as any[] || []}
                                        dataKey="total"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        label={({ name, percent }) =>
                                            `${name}: ${formatNumber((percent ?? 0) * 100)}%`
                                        }
                                        labelLine={false}
                                    >
                                        {stats?.categories.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Bar Chart - Daily Trend */}
                <Card>
                    <CardHeader>
                        <CardTitle>اتجاه المصروفات اليومي</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats?.dailyData || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10 }}
                                        tickFormatter={(v) => format(new Date(v), 'dd/MM')}
                                    />
                                    <YAxis tickFormatter={(v) => `${formatNumber(v / 1000)}k`} />
                                    <Tooltip
                                        formatter={(value) => formatCurrency(value as number)}
                                        labelFormatter={(label) => format(new Date(label as string), 'dd MMMM yyyy', { locale: arEG })}
                                    />
                                    <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Categories Breakdown */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>تفصيل المصروفات حسب الفئة</CardTitle>
                            <CardDescription>
                                نسبة مساهمة كل فئة في إجمالي المصروفات
                            </CardDescription>
                        </div>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'total' | 'count')}>
                            <SelectTrigger className="w-[140px]">
                                <ArrowUpDown className="w-4 h-4 ml-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="total">حسب القيمة</SelectItem>
                                <SelectItem value="count">حسب العدد</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {stats?.categories.map((cat) => (
                            <div key={cat.name} className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: cat.color }}
                                        />
                                        <span className="font-medium">{cat.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {cat.count} معاملة
                                        </Badge>
                                    </div>
                                    <div className="text-left">
                                        <span className="font-bold">{formatCurrency(cat.total)}</span>
                                        <span className="text-muted-foreground text-sm mr-2">
                                            ({formatNumber(cat.percentage)}%)
                                        </span>
                                    </div>
                                </div>
                                {/* Progress bar */}
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${cat.percentage}%`,
                                            backgroundColor: cat.color
                                        }}
                                    />
                                </div>
                            </div>
                        ))}

                        {(!stats?.categories || stats.categories.length === 0) && (
                            <p className="text-center text-muted-foreground py-8">
                                لا توجد مصروفات في هذه الفترة
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Top Expenses */}
            {stats?.topExpenses && stats.topExpenses.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>أكبر 5 مصروفات</CardTitle>
                        <CardDescription>أعلى المعاملات قيمة في الفترة المحددة</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {stats.topExpenses.map((expense, index) => (
                                <div
                                    key={expense.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 font-bold text-sm">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="font-medium">{expense.description || expense.category}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Badge variant="outline" className="text-xs">
                                                    {expense.category}
                                                </Badge>
                                                <span>•</span>
                                                <span>{format(new Date(expense.transaction_date), 'dd/MM/yyyy')}</span>
                                                {expense.treasury?.name && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{expense.treasury.name}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="font-bold text-red-600">
                                        {formatCurrency(expense.amount)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
