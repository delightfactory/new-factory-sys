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
    ArrowUpDown,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Search,
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
} from "recharts";

interface InventoryItem {
    id: number;
    name: string;
    code?: string;
    quantity: number;
    unit_cost: number;
    sales_price?: number;
    unit?: string;
    type: string;
    typeLabel: string;
    totalValue: number;
    potentialProfit: number;
    profitMargin: number;
}

type SortField = 'totalValue' | 'quantity' | 'unit_cost' | 'profitMargin' | 'name';
type SortDirection = 'asc' | 'desc';

const TYPE_COLORS = {
    raw: '#f59e0b',
    packaging: '#8b5cf6',
    semi: '#3b82f6',
    finished: '#10b981'
};

const TYPE_LABELS = {
    raw: 'مادة خام',
    packaging: 'مادة تعبئة',
    semi: 'نصف مصنع',
    finished: 'منتج تام'
};

export default function InventoryAnalytics() {
    const [sortField, setSortField] = useState<SortField>('totalValue');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filterType, setFilterType] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: items, isLoading } = useQuery({
        queryKey: ['inventory-analytics'],
        queryFn: async () => {
            const [raw, packaging, semi, finished] = await Promise.all([
                supabase.from('raw_materials').select('id, code, name, quantity, unit_cost, sales_price, unit'),
                supabase.from('packaging_materials').select('id, code, name, quantity, unit_cost, sales_price'),
                supabase.from('semi_finished_products').select('id, code, name, quantity, unit_cost, sales_price'),
                supabase.from('finished_products').select('id, code, name, quantity, unit_cost, sales_price')
            ]);

            const mapItems = (data: any[], type: string, typeLabel: string): InventoryItem[] =>
                (data || []).map(item => {
                    const totalValue = (item.quantity || 0) * (item.unit_cost || 0);
                    const salesValue = (item.quantity || 0) * (item.sales_price || 0);
                    const potentialProfit = salesValue - totalValue;
                    const profitMargin = totalValue > 0 ? ((potentialProfit / totalValue) * 100) : 0;

                    return {
                        ...item,
                        type,
                        typeLabel,
                        totalValue,
                        potentialProfit,
                        profitMargin
                    };
                });

            return [
                ...mapItems(raw.data || [], 'raw', TYPE_LABELS.raw),
                ...mapItems(packaging.data || [], 'packaging', TYPE_LABELS.packaging),
                ...mapItems(semi.data || [], 'semi', TYPE_LABELS.semi),
                ...mapItems(finished.data || [], 'finished', TYPE_LABELS.finished)
            ];
        }
    });

    // Filtered and sorted items
    const processedItems = useMemo(() => {
        if (!items) return [];

        let result = [...items];

        // Filter by type
        if (filterType !== 'all') {
            result = result.filter(item => item.type === filterType);
        }

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(query) ||
                (item.code && item.code.toLowerCase().includes(query))
            );
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            if (sortField === 'name') {
                comparison = a.name.localeCompare(b.name, 'ar');
            } else {
                comparison = (a[sortField] || 0) - (b[sortField] || 0);
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

        return result;
    }, [items, filterType, searchQuery, sortField, sortDirection]);

    // Statistics
    const stats = useMemo(() => {
        if (!items || items.length === 0) return null;

        const totalValue = items.reduce((sum, item) => sum + item.totalValue, 0);
        const totalProfit = items.reduce((sum, item) => sum + item.potentialProfit, 0);

        // Distribution by type
        const byType = Object.keys(TYPE_COLORS).map(type => {
            const typeItems = items.filter(i => i.type === type);
            const value = typeItems.reduce((sum, i) => sum + i.totalValue, 0);
            return {
                name: TYPE_LABELS[type as keyof typeof TYPE_LABELS],
                value,
                color: TYPE_COLORS[type as keyof typeof TYPE_COLORS],
                count: typeItems.length,
                percentage: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0
            };
        }).filter(t => t.value > 0);

        // Top 5 by value
        const top5 = [...items].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);

        // ABC Analysis
        const sortedByValue = [...items].sort((a, b) => b.totalValue - a.totalValue);
        let cumulative = 0;
        const abcItems = sortedByValue.map(item => {
            cumulative += item.totalValue;
            const cumulativePercent = (cumulative / totalValue) * 100;
            let category: 'A' | 'B' | 'C';
            if (cumulativePercent <= 80) category = 'A';
            else if (cumulativePercent <= 95) category = 'B';
            else category = 'C';
            return { ...item, category, cumulativePercent };
        });

        const abcSummary = {
            A: abcItems.filter(i => i.category === 'A'),
            B: abcItems.filter(i => i.category === 'B'),
            C: abcItems.filter(i => i.category === 'C')
        };

        return {
            totalValue,
            totalProfit,
            totalItems: items.length,
            byType,
            top5,
            abcSummary
        };
    }, [items]);



    const currencyFormat = (value: number) => formatCurrency(value);

    if (isLoading) return <CardGridSkeleton count={4} />;

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
                <PageHeader
                    title="تحليل المخزون المتقدم"
                    description="تقييم شامل للمخزون مع تحليل ABC وتوزيع القيمة"
                    icon={BarChart3}
                />
                <div className="flex gap-2">
                    <PrintButton />
                    <Button>
                        <Download className="w-4 h-4 ml-2" />
                        تصدير
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            إجمالي قيمة المخزون
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {currencyFormat(stats?.totalValue || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
                            الربح المحتمل
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-green-700 dark:text-green-300 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            {currencyFormat(stats?.totalProfit || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">عدد الأصناف</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold">{stats?.totalItems || 0}</div>
                        <p className="text-xs text-muted-foreground">في {stats?.byType.length || 0} فئات</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">أصناف A (80% قيمة)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-amber-600">
                            {stats?.abcSummary.A.length || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">تحتاج متابعة دقيقة</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Pie Chart - Distribution by Type */}
                <Card>
                    <CardHeader>
                        <CardTitle>توزيع القيمة حسب النوع</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats?.byType || []}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        label={({ name, percent }) => `${name}: ${formatNumber((percent ?? 0) * 100)}%`}
                                        labelLine={false}
                                    >
                                        {stats?.byType.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => currencyFormat(value as number)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Bar Chart - Top 5 */}
                <Card>
                    <CardHeader>
                        <CardTitle>أعلى 5 أصناف قيمة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats?.top5 || []} layout="vertical">
                                    <XAxis type="number" tickFormatter={(v) => `${formatNumber(v / 1000)}k`} />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip formatter={(value) => currencyFormat(value as number)} />
                                    <Bar dataKey="totalValue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ABC Analysis Summary */}
            <Card>
                <CardHeader>
                    <CardTitle>تحليل ABC (باريتو)</CardTitle>
                    <CardDescription>
                        توزيع الأصناف حسب مساهمتها في القيمة الإجمالية
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200">
                            <div className="flex items-center justify-between mb-2">
                                <Badge className="bg-red-500">A</Badge>
                                <span className="text-sm text-muted-foreground">80% من القيمة</span>
                            </div>
                            <div className="text-2xl font-bold">{stats?.abcSummary.A.length || 0} صنف</div>
                            <p className="text-xs text-muted-foreground mt-1">أصناف حرجة - متابعة يومية</p>
                        </div>
                        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200">
                            <div className="flex items-center justify-between mb-2">
                                <Badge className="bg-amber-500">B</Badge>
                                <span className="text-sm text-muted-foreground">15% من القيمة</span>
                            </div>
                            <div className="text-2xl font-bold">{stats?.abcSummary.B.length || 0} صنف</div>
                            <p className="text-xs text-muted-foreground mt-1">أصناف متوسطة - متابعة أسبوعية</p>
                        </div>
                        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200">
                            <div className="flex items-center justify-between mb-2">
                                <Badge className="bg-green-500">C</Badge>
                                <span className="text-sm text-muted-foreground">5% من القيمة</span>
                            </div>
                            <div className="text-2xl font-bold">{stats?.abcSummary.C.length || 0} صنف</div>
                            <p className="text-xs text-muted-foreground mt-1">أصناف منخفضة - متابعة شهرية</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filters and Search */}
            <Card className="print:hidden">
                <CardContent className="pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث بالاسم أو الكود..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="w-[140px]">
                                    <Filter className="w-4 h-4 ml-2" />
                                    <SelectValue placeholder="النوع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="raw">مواد خام</SelectItem>
                                    <SelectItem value="packaging">مواد تعبئة</SelectItem>
                                    <SelectItem value="semi">نصف مصنع</SelectItem>
                                    <SelectItem value="finished">منتج تام</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                                <SelectTrigger className="w-[140px]">
                                    <ArrowUpDown className="w-4 h-4 ml-2" />
                                    <SelectValue placeholder="ترتيب" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="totalValue">القيمة</SelectItem>
                                    <SelectItem value="quantity">الكمية</SelectItem>
                                    <SelectItem value="unit_cost">التكلفة</SelectItem>
                                    <SelectItem value="profitMargin">هامش الربح</SelectItem>
                                    <SelectItem value="name">الاسم</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                            >
                                {sortDirection === 'desc' ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Items List - Mobile Cards + Desktop visible */}
            <div className="space-y-3">
                {processedItems.slice(0, 50).map((item) => (
                    <Card key={`${item.type}-${item.id}`} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-3">
                                    <div
                                        className="w-3 h-10 rounded-full"
                                        style={{ backgroundColor: TYPE_COLORS[item.type as keyof typeof TYPE_COLORS] }}
                                    />
                                    <div>
                                        <h3 className="font-medium">{item.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="text-xs">
                                                {item.typeLabel}
                                            </Badge>
                                            {item.code && (
                                                <span className="text-xs text-muted-foreground font-mono">
                                                    {item.code}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-center md:flex md:gap-6">
                                    <div>
                                        <p className="text-xs text-muted-foreground">الكمية</p>
                                        <p className="font-mono font-medium">{item.quantity}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">التكلفة</p>
                                        <p className="font-mono">{formatCurrency(item.unit_cost || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">القيمة</p>
                                        <p className="font-mono font-bold text-blue-600">
                                            {formatCurrency(item.totalValue)}
                                        </p>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-xs text-muted-foreground">هامش الربح</p>
                                        <p className={`font-mono ${item.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatNumber(item.profitMargin)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {processedItems.length > 50 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                        يتم عرض أول 50 صنف من {processedItems.length}
                    </p>
                )}
            </div>
        </div>
    );
}
