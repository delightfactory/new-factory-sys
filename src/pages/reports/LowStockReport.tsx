import { formatQuantity as displayQuantity, formatPercentage as displayPercent } from '@/lib/number-format';
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertTriangle,
    ArrowRight,
    ShoppingCart,
    Package,
    Boxes,
    Factory,
    PackageCheck,
    Filter,
    TrendingDown,
    AlertCircle,
    CheckCircle2
} from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { PrintButton } from "@/components/print/PrintLayout";

type InventoryType = 'all' | 'raw' | 'packaging' | 'semi' | 'finished' | 'bundle';
type UrgencyLevel = 'all' | 'critical' | 'warning' | 'ok';

interface LowStockItem {
    id: number;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    min_stock: number;
    type: InventoryType;
    typeLabel: string;
    typeColor: string;
    stockLevel: number; // percentage: quantity / min_stock * 100
    urgency: 'critical' | 'warning' | 'ok';
    deficit: number; // how much needed to reach min_stock
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
    raw: {
        label: 'مادة خام',
        color: 'text-amber-700 dark:text-amber-400',
        icon: Boxes,
        bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'
    },
    packaging: {
        label: 'مادة تعبئة',
        color: 'text-purple-700 dark:text-purple-400',
        icon: Package,
        bgColor: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200'
    },
    semi: {
        label: 'نصف مصنع',
        color: 'text-blue-700 dark:text-blue-400',
        icon: Factory,
        bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200'
    },
    finished: {
        label: 'منتج تام',
        color: 'text-green-700 dark:text-green-400',
        icon: PackageCheck,
        bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200'
    },
    bundle: {
        label: 'باندل',
        color: 'text-pink-700 dark:text-pink-400',
        icon: Package,
        bgColor: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200'
    }
};

export default function LowStockReport() {
    const [filterType, setFilterType] = useState<InventoryType>('all');
    const [filterUrgency, setFilterUrgency] = useState<UrgencyLevel>('all');

    const { data, isLoading } = useQuery({
        queryKey: ['report-low-stock-comprehensive'],
        queryFn: async () => {
            // Fetch all inventory types in parallel
            const [raw, packaging, semi, finished, bundles] = await Promise.all([
                supabase.from('raw_materials').select('id, code, name, unit, quantity, min_stock'),
                supabase.from('packaging_materials').select('id, code, name, unit, quantity, min_stock'),
                supabase.from('semi_finished_products').select('id, code, name, unit, quantity, min_stock'),
                supabase.from('finished_products').select('id, code, name, unit, quantity, min_stock'),
                supabase.from('product_bundles').select('id, code, name, quantity, min_stock').eq('is_active', true)
            ]);

            const processItems = (
                items: any[] | null,
                type: InventoryType,
                config: typeof TYPE_CONFIG[string]
            ): LowStockItem[] => {
                if (!items) return [];

                return items
                    // Only track items where min_stock > 0 (user wants to track them)
                    .filter(item => (item.min_stock || 0) > 0)
                    .map(item => {
                        const quantity = item.quantity || 0;
                        const minStock = item.min_stock || 1;
                        const stockLevel = Math.round((quantity / minStock) * 100);
                        const deficit = Math.max(0, minStock - quantity);

                        let urgency: 'critical' | 'warning' | 'ok' = 'ok';
                        if (quantity === 0) urgency = 'critical';
                        else if (quantity <= minStock) urgency = 'warning';

                        return {
                            id: item.id,
                            code: item.code || '',
                            name: item.name,
                            unit: item.unit || 'وحدة',
                            quantity,
                            min_stock: minStock,
                            type,
                            typeLabel: config.label,
                            typeColor: config.color,
                            stockLevel,
                            urgency,
                            deficit
                        };
                    });
            };

            const allItems = [
                ...processItems(raw.data, 'raw', TYPE_CONFIG.raw),
                ...processItems(packaging.data, 'packaging', TYPE_CONFIG.packaging),
                ...processItems(semi.data, 'semi', TYPE_CONFIG.semi),
                ...processItems(finished.data, 'finished', TYPE_CONFIG.finished),
                ...processItems(bundles.data, 'bundle', TYPE_CONFIG.bundle)
            ];

            // Filter only low stock items (quantity <= min_stock)
            const lowStockItems = allItems
                .filter(item => item.quantity <= item.min_stock)
                .sort((a, b) => a.stockLevel - b.stockLevel); // Most critical first

            // Summary stats
            const stats = {
                total: lowStockItems.length,
                critical: lowStockItems.filter(i => i.urgency === 'critical').length,
                warning: lowStockItems.filter(i => i.urgency === 'warning').length,
                byType: {
                    raw: lowStockItems.filter(i => i.type === 'raw').length,
                    packaging: lowStockItems.filter(i => i.type === 'packaging').length,
                    semi: lowStockItems.filter(i => i.type === 'semi').length,
                    finished: lowStockItems.filter(i => i.type === 'finished').length,
                    bundle: lowStockItems.filter(i => i.type === 'bundle').length
                },
                trackedItems: allItems.length, // Total items being tracked
                healthyItems: allItems.filter(i => i.urgency === 'ok').length
            };

            return { items: lowStockItems, stats, allItems };
        }
    });

    // Apply filters
    const filteredItems = data?.items.filter(item => {
        if (filterType !== 'all' && item.type !== filterType) return false;
        if (filterUrgency !== 'all' && item.urgency !== filterUrgency) return false;
        return true;
    }) || [];

    const formatNumber = displayQuantity;

    const getUrgencyBadge = (urgency: string, quantity: number) => {
        if (urgency === 'critical' || quantity === 0) {
            return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" />نافذ</Badge>;
        }
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
            <TrendingDown className="w-3 h-3" />منخفض
        </Badge>;
    };

    const getStockProgressColor = (level: number) => {
        if (level === 0) return '[&>div]:bg-red-500';
        if (level <= 50) return '[&>div]:bg-amber-500';
        if (level <= 100) return '[&>div]:bg-yellow-500';
        return '[&>div]:bg-green-500';
    };

    return (
        <div className="space-y-6 print:space-y-2">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="نظام تتبع المخزون الشامل"
                        description="مراقبة ذكية لجميع أنواع المخزون (خامات، تعبئة، نصف مصنع، منتجات)"
                        icon={AlertTriangle}
                    />
                </div>
                <div className="flex gap-2 mr-auto sm:mr-0">
                    <PrintButton />
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold text-red-600 flex items-center justify-center gap-2">
                    <AlertTriangle className="w-6 h-6" />
                    تقرير نواقص المخزون الشامل
                </h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={4} />
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                        {/* Total Critical */}
                        <Card className={`${data?.stats.total === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} dark:border-opacity-50`}>
                            <CardHeader className="pb-2">
                                <CardTitle className={`text-sm font-medium ${data?.stats.total === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {data?.stats.total === 0 ? 'المخزون آمن' : 'إجمالي النواقص'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-3xl font-bold ${data?.stats.total === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {data?.stats.total === 0 ? <CheckCircle2 className="w-8 h-8" /> : data?.stats.total}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    من {data?.stats.trackedItems} صنف متتبع
                                </p>
                            </CardContent>
                        </Card>

                        {/* By Type */}
                        {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                            const count = data?.stats.byType[key as keyof typeof data.stats.byType] || 0;
                            const Icon = config.icon;
                            return (
                                <Card key={key} className={count > 0 ? config.bgColor : ''}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className={`text-sm font-medium flex items-center gap-1 ${config.color}`}>
                                            <Icon className="w-4 h-4" />
                                            {config.label}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className={`text-2xl font-bold ${count > 0 ? config.color : 'text-green-600'}`}>
                                            {count || <CheckCircle2 className="w-6 h-6" />}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Filters */}
                    {data && data.stats.total > 0 && (
                        <Card className="print:hidden">
                            <CardContent className="pt-4">
                                <div className="flex flex-wrap gap-3 items-center">
                                    <div className="flex items-center gap-2">
                                        <Filter className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">فلترة:</span>
                                    </div>
                                    <Select value={filterType} onValueChange={(v) => setFilterType(v as InventoryType)}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="النوع" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">جميع الأنواع</SelectItem>
                                            <SelectItem value="raw">المواد الخام</SelectItem>
                                            <SelectItem value="packaging">مواد التعبئة</SelectItem>
                                            <SelectItem value="semi">نصف المصنع</SelectItem>
                                            <SelectItem value="finished">المنتجات التامة</SelectItem>
                                            <SelectItem value="bundle">الباندلات</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select value={filterUrgency} onValueChange={(v) => setFilterUrgency(v as UrgencyLevel)}>
                                        <SelectTrigger className="w-[140px]">
                                            <SelectValue placeholder="الحالة" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">جميع الحالات</SelectItem>
                                            <SelectItem value="critical">نافذ (حرج)</SelectItem>
                                            <SelectItem value="warning">منخفض</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {(filterType !== 'all' || filterUrgency !== 'all') && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setFilterType('all'); setFilterUrgency('all'); }}
                                        >
                                            إزالة الفلاتر
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Empty State */}
                    {data?.stats.total === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 rounded-xl border border-green-100">
                            <div className="p-4 bg-green-100 dark:bg-green-800/30 rounded-full mb-4">
                                <CheckCircle2 className="w-12 h-12 text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold text-green-700 dark:text-green-400">المخزون آمن بالكامل! 🎉</h3>
                            <p className="text-muted-foreground text-sm mt-2">جميع الأصناف المتتبعة فوق الحد الأدنى</p>
                            <p className="text-xs text-muted-foreground mt-1">يتم تتبع {data.stats.trackedItems} صنف (الأصناف ذات الحد الأدنى أكبر من صفر)</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <Card className="p-8 text-center">
                            <p className="text-muted-foreground">لا توجد نتائج تطابق الفلاتر المحددة</p>
                        </Card>
                    ) : (
                        <Card className="border-red-200 dark:border-red-900/50">
                            <CardHeader className="bg-red-50/50 dark:bg-red-900/20 print:bg-transparent">
                                <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    {filteredItems.length} صنف يحتاج اهتمام
                                </CardTitle>
                                <CardDescription>
                                    مرتبة من الأكثر حرجاً • {data?.stats.critical} نافذ تماماً • {data?.stats.warning} منخفض
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0 sm:p-6">
                                {/* Desktop Table */}
                                <div className="hidden sm:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>الصنف</TableHead>
                                                <TableHead>النوع</TableHead>
                                                <TableHead className="text-center">مستوى المخزون</TableHead>
                                                <TableHead className="text-center">الرصيد</TableHead>
                                                <TableHead className="text-center">الحد الأدنى</TableHead>
                                                <TableHead className="text-center">النقص</TableHead>
                                                <TableHead className="text-center">الحالة</TableHead>
                                                <TableHead className="text-left print:hidden">إجراء</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredItems.map((item) => {
                                                const config = TYPE_CONFIG[item.type];
                                                const Icon = config?.icon || Package;
                                                return (
                                                    <TableRow key={`${item.type}-${item.id}`} className="hover:bg-red-50/30 dark:hover:bg-red-900/10">
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-medium">{item.name}</p>
                                                                <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className={`gap-1 ${config?.color}`}>
                                                                <Icon className="w-3 h-3" />
                                                                {item.typeLabel}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="w-32">
                                                            <div className="space-y-1">
                                                                <Progress
                                                                    value={Math.min(item.stockLevel, 100)}
                                                                    className={`h-2 ${getStockProgressColor(item.stockLevel)}`}
                                                                />
                                                                <p className="text-xs text-center text-muted-foreground">{displayPercent(item.stockLevel)}%</p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-bold text-red-600">
                                                            {formatNumber(item.quantity)} {item.unit}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono text-muted-foreground">
                                                            {formatNumber(item.min_stock)} {item.unit}
                                                        </TableCell>
                                                        <TableCell className="text-center font-bold text-orange-600">
                                                            {item.deficit > 0 ? `-${formatNumber(item.deficit)}` : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            {getUrgencyBadge(item.urgency, item.quantity)}
                                                        </TableCell>
                                                        <TableCell className="text-left print:hidden">
                                                            {(item.type === 'raw' || item.type === 'packaging') && (
                                                                <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" asChild>
                                                                    <Link to={`/commercial/buying`}>
                                                                        <ShoppingCart className="w-4 h-4 ml-1" />
                                                                        طلب شراء
                                                                    </Link>
                                                                </Button>
                                                            )}
                                                            {item.type === 'semi' && (
                                                                <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50" asChild>
                                                                    <Link to={`/production/orders`}>
                                                                        <Factory className="w-4 h-4 ml-1" />
                                                                        أمر إنتاج
                                                                    </Link>
                                                                </Button>
                                                            )}
                                                            {item.type === 'finished' && (
                                                                <Button size="sm" variant="outline" className="border-green-200 text-green-700 hover:bg-green-50" asChild>
                                                                    <Link to={`/packaging`}>
                                                                        <PackageCheck className="w-4 h-4 ml-1" />
                                                                        أمر تعبئة
                                                                    </Link>
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Mobile Cards */}
                                <div className="sm:hidden space-y-3 p-4">
                                    {filteredItems.map((item) => {
                                        const config = TYPE_CONFIG[item.type];
                                        const Icon = config?.icon || Package;
                                        return (
                                            <div
                                                key={`${item.type}-${item.id}`}
                                                className={`p-4 rounded-lg border ${item.urgency === 'critical'
                                                    ? 'border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800'
                                                    : 'border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3 mb-3">
                                                    <div>
                                                        <h3 className="font-medium text-foreground">{item.name}</h3>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Badge variant="outline" className={`text-xs ${config?.color}`}>
                                                                <Icon className="w-3 h-3 mr-1" />
                                                                {item.typeLabel}
                                                            </Badge>
                                                            {getUrgencyBadge(item.urgency, item.quantity)}
                                                        </div>
                                                    </div>
                                                    {(item.type === 'raw' || item.type === 'packaging') && (
                                                        <Button size="sm" variant="outline" className="shrink-0" asChild>
                                                            <Link to="/commercial/buying"><ShoppingCart className="w-4 h-4" /></Link>
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-muted-foreground">مستوى المخزون</span>
                                                        <span className="font-bold text-foreground">{displayPercent(item.stockLevel)}%</span>
                                                    </div>
                                                    <Progress
                                                        value={Math.min(item.stockLevel, 100)}
                                                        className={`h-2 ${getStockProgressColor(item.stockLevel)}`}
                                                    />
                                                    <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                                                        <div className="p-2 rounded bg-red-100 dark:bg-red-900/50 text-center">
                                                            <p className="text-muted-foreground">الرصيد</p>
                                                            <p className="font-bold text-red-600 dark:text-red-400">{formatNumber(item.quantity)}</p>
                                                        </div>
                                                        <div className="p-2 rounded bg-slate-100 dark:bg-slate-800 text-center">
                                                            <p className="text-muted-foreground">الحد الأدنى</p>
                                                            <p className="font-mono text-foreground">{formatNumber(item.min_stock)}</p>
                                                        </div>
                                                        <div className="p-2 rounded bg-orange-100 dark:bg-orange-900/50 text-center">
                                                            <p className="text-muted-foreground">النقص</p>
                                                            <p className="font-bold text-orange-600 dark:text-orange-400">{formatNumber(item.deficit)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Info Card */}
                    <Card className="bg-slate-50 dark:bg-slate-900/20 print:hidden">
                        <CardContent className="pt-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                                <div>
                                    <h4 className="font-semibold text-sm mb-1">كيف يعمل نظام التتبع؟</h4>
                                    <p className="text-sm text-muted-foreground">
                                        يتم تتبع الأصناف التي تم تحديد <strong>حد أدنى أكبر من صفر</strong> فقط.
                                        لإضافة صنف للتتبع، قم بتعديله وأدخل قيمة للحد الأدنى.
                                        الأصناف بحد أدنى = 0 لا يتم تتبعها.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
