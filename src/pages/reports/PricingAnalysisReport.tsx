import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Tags, TrendingUp, TrendingDown, AlertTriangle, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import { useState, useMemo } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";

interface PricingItem {
    id: number;
    name: string;
    code: string;
    type: 'finished' | 'bundle' | 'raw' | 'packaging' | 'semi';
    typeLabel: string;
    unitCost: number;
    salesPrice: number;
    marginAmount: number;
    marginPercent: number;
    suggestedPrice25: number;
    suggestedPrice30: number;
    quantity: number;
}

type SortField = 'marginPercent' | 'marginAmount' | 'salesPrice' | 'unitCost' | 'name';

export default function PricingAnalysisReport() {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<SortField>('marginPercent');
    const [targetMargin, setTargetMargin] = useState(25);

    const { data: items, isLoading } = useQuery({
        queryKey: ['pricing-analysis'],
        queryFn: async () => {
            const results: PricingItem[] = [];

            // Finished products
            const { data: finished } = await supabase
                .from('finished_products')
                .select('id, code, name, unit_cost, sales_price, quantity');

            finished?.forEach(p => {
                const cost = p.unit_cost || 0;
                const price = p.sales_price || 0;
                const margin = price - cost;
                const marginPct = price > 0 ? (margin / price) * 100 : 0;
                results.push({
                    id: p.id, name: p.name, code: p.code, type: 'finished',
                    typeLabel: 'منتج تام', unitCost: cost, salesPrice: price,
                    marginAmount: margin, marginPercent: marginPct,
                    suggestedPrice25: cost / (1 - 0.25),
                    suggestedPrice30: cost / (1 - 0.30),
                    quantity: p.quantity
                });
            });

            // Bundles
            const { data: bundles } = await supabase
                .from('product_bundles')
                .select('id, code, name, bundle_price, quantity')
                .eq('is_active', true);

            // Get bundle items cost
            for (const b of (bundles || [])) {
                const { data: bundleItems } = await supabase
                    .from('bundle_items')
                    .select(`
                        quantity, item_type,
                        finished_product:finished_products(unit_cost),
                        semi_finished:semi_finished_products(unit_cost),
                        raw_material:raw_materials(unit_cost),
                        packaging_material:packaging_materials(unit_cost)
                    `)
                    .eq('bundle_id', b.id);

                let cost = 0;
                bundleItems?.forEach((item: any) => {
                    const uc = item.finished_product?.unit_cost || item.semi_finished?.unit_cost || item.raw_material?.unit_cost || item.packaging_material?.unit_cost || 0;
                    cost += uc * item.quantity;
                });

                const price = b.bundle_price || 0;
                const margin = price - cost;
                const marginPct = price > 0 ? (margin / price) * 100 : 0;
                results.push({
                    id: b.id + 10000, name: `📦 ${b.name}`, code: b.code, type: 'bundle',
                    typeLabel: 'باقة', unitCost: cost, salesPrice: price,
                    marginAmount: margin, marginPercent: marginPct,
                    suggestedPrice25: cost / (1 - 0.25),
                    suggestedPrice30: cost / (1 - 0.30),
                    quantity: b.quantity
                });
            }

            // Raw materials with sales_price
            const { data: raw } = await supabase
                .from('raw_materials')
                .select('id, code, name, unit_cost, sales_price, quantity')
                .gt('sales_price', 0);

            raw?.forEach(p => {
                const cost = p.unit_cost || 0;
                const price = p.sales_price || 0;
                const margin = price - cost;
                const marginPct = price > 0 ? (margin / price) * 100 : 0;
                results.push({
                    id: p.id + 20000, name: p.name, code: p.code, type: 'raw',
                    typeLabel: 'مادة خام', unitCost: cost, salesPrice: price,
                    marginAmount: margin, marginPercent: marginPct,
                    suggestedPrice25: cost / (1 - 0.25),
                    suggestedPrice30: cost / (1 - 0.30),
                    quantity: p.quantity
                });
            });

            return results;
        }
    });

    const filtered = useMemo(() => {
        let result = items || [];
        if (search) {
            result = result.filter(i => i.name.includes(search) || i.code.includes(search));
        }
        result.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            if (sortBy === 'marginPercent') return a.marginPercent - b.marginPercent; // ascending: worst margins first
            return b[sortBy] - a[sortBy]; // descending for amounts
        });
        return result;
    }, [items, search, sortBy]);

    const negativeCount = items?.filter(i => i.marginPercent < 0).length || 0;
    const lowCount = items?.filter(i => i.marginPercent >= 0 && i.marginPercent < 15).length || 0;
    const goodCount = items?.filter(i => i.marginPercent >= 15).length || 0;

    const chartData = filtered.map(i => ({
        name: i.name.length > 15 ? i.name.substring(0, 15) + '...' : i.name,
        margin: Math.round(i.marginPercent * 10) / 10
    })).slice(0, 20);

    const getMarginColor = (percent: number) => {
        if (percent < 0) return '#ef4444';
        if (percent < 15) return '#f59e0b';
        if (percent < 30) return '#3b82f6';
        return '#10b981';
    };

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تحليل التسعير"
                        description="مقارنة التكاليف بأسعار البيع وتقييم هوامش الربح مع اقتراحات التسعير"
                        icon={Tags}
                    />
                </div>
                <PrintButton />
            </div>

            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تحليل التسعير</h1>
                <p className="text-sm text-gray-500">تاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? <CardGridSkeleton count={3} /> : (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />هامش سلبي</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-red-700">{negativeCount} <span className="text-sm font-normal">منتج</span></div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-700">هامش منخفض (&lt;15%)</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-amber-700">{lowCount} <span className="text-sm font-normal">منتج</span></div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">هامش جيد (≥15%)</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-emerald-700">{goodCount} <span className="text-sm font-normal">منتج</span></div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">متوسط هامش الربح</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{formatNumber((items?.reduce((s, i) => s + i.marginPercent, 0) || 0) / (items?.length || 1))}%</div></CardContent>
                        </Card>
                    </div>

                    {/* Margin Chart */}
                    <Card>
                        <CardHeader>
                            <CardTitle>هوامش الربح — نظرة سريعة</CardTitle>
                            <CardDescription>الخط الأحمر: حد الهامش 15%</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                                        <Tooltip formatter={(v) => `${v}%`} contentStyle={{ direction: 'rtl' }} />
                                        <ReferenceLine x={15} stroke="#ef4444" strokeDasharray="3 3" label="15%" />
                                        <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                                            {chartData.map((entry, index) => (
                                                <Cell key={index} fill={getMarginColor(entry.margin)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Filters & Table */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <CardTitle>تفاصيل التسعير</CardTitle>
                                <div className="flex gap-2 items-center">
                                    <div className="relative">
                                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="بحث..."
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            className="pr-9 w-[200px]"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        <span>هامش مستهدف:</span>
                                        <Input
                                            type="number"
                                            value={targetMargin}
                                            onChange={e => setTargetMargin(Number(e.target.value))}
                                            className="w-16 h-8"
                                        />
                                        <span>%</span>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead className="text-center">النوع</TableHead>
                                        <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy('unitCost')}>التكلفة</TableHead>
                                        <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy('salesPrice')}>السعر</TableHead>
                                        <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy('marginAmount')}>الهامش</TableHead>
                                        <TableHead className="text-center cursor-pointer hover:text-primary" onClick={() => setSortBy('marginPercent')}>النسبة</TableHead>
                                        <TableHead className="text-center">السعر المقترح ({targetMargin}%)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map(item => {
                                        const suggestedPrice = item.unitCost > 0 ? item.unitCost / (1 - targetMargin / 100) : 0;
                                        const priceDiff = suggestedPrice - item.salesPrice;
                                        return (
                                            <TableRow key={item.id} className={item.marginPercent < 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="text-xs">{item.typeLabel}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-sm">{formatCurrency(item.unitCost)}</TableCell>
                                                <TableCell className="text-center font-mono text-sm">{formatCurrency(item.salesPrice)}</TableCell>
                                                <TableCell className={`text-center font-mono text-sm font-bold ${item.marginPercent < 0 ? 'text-red-600' : item.marginPercent < 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                    {formatCurrency(item.marginAmount)}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className={`flex items-center justify-center gap-1 font-bold ${item.marginPercent < 0 ? 'text-red-600' : item.marginPercent < 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                        {item.marginPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                        {formatNumber(item.marginPercent)}%
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-sm">
                                                    {suggestedPrice > 0 ? (
                                                        <div>
                                                            <span>{formatCurrency(suggestedPrice)}</span>
                                                            {priceDiff > 0 && (
                                                                <div className="text-xs text-red-500">+{formatCurrency(priceDiff)}</div>
                                                            )}
                                                        </div>
                                                    ) : '-'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
