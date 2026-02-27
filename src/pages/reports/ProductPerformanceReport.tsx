import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, ArrowRight, Package, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { PrintButton } from "@/components/print/PrintLayout";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

interface ProductData {
    id: number;
    name: string;
    type: string;
    salesPrice: number;
    unitCost: number;
    quantity: number;
    potentialRevenue: number;
    marginAmount: number;
    marginPercent: number;
    totalSold: number;
    totalRevenue: number;
}

type SortField = 'potentialRevenue' | 'marginPercent' | 'totalSold' | 'totalRevenue' | 'name';

export default function ProductPerformanceReport() {
    const [sortBy, setSortBy] = useState<SortField>('totalRevenue');
    const [search, setSearch] = useState('');

    const { data: products, isLoading } = useQuery({
        queryKey: ['report-product-performance-enhanced'],
        queryFn: async () => {
            // Fetch finished products with cost
            const [finished, bundles, salesItems] = await Promise.all([
                supabase.from('finished_products').select('id, name, sales_price, unit_cost, quantity'),
                supabase.from('product_bundles').select('id, name, bundle_price, quantity').eq('is_active', true),
                supabase.from('sales_invoice_items').select('finished_product_id, quantity, unit_price, sales_invoices!inner(status)')
                    .eq('sales_invoices.status', 'posted')
            ]);

            // Aggregate sales by product
            const salesByProduct = new Map<number, { totalSold: number; totalRevenue: number }>();
            (salesItems.data || []).forEach((item: any) => {
                if (!item.finished_product_id) return;
                const existing = salesByProduct.get(item.finished_product_id) || { totalSold: 0, totalRevenue: 0 };
                existing.totalSold += item.quantity;
                existing.totalRevenue += item.quantity * item.unit_price;
                salesByProduct.set(item.finished_product_id, existing);
            });

            const results: ProductData[] = [];

            // Map finished products
            (finished.data || []).forEach(p => {
                const cost = p.unit_cost || 0;
                const price = p.sales_price || 0;
                const margin = price - cost;
                const marginPct = price > 0 ? (margin / price) * 100 : 0;
                const sales = salesByProduct.get(p.id) || { totalSold: 0, totalRevenue: 0 };

                results.push({
                    id: p.id, name: p.name, type: 'product',
                    salesPrice: price, unitCost: cost, quantity: p.quantity,
                    potentialRevenue: price * (p.quantity || 0),
                    marginAmount: margin, marginPercent: marginPct,
                    totalSold: sales.totalSold, totalRevenue: sales.totalRevenue
                });
            });

            // Map bundles WITH cost calculation
            for (const b of (bundles.data || [])) {
                const { data: bundleItems } = await supabase
                    .from('bundle_items')
                    .select(`quantity, item_type,
                        finished_product:finished_products(unit_cost),
                        semi_finished:semi_finished_products(unit_cost),
                        raw_material:raw_materials(unit_cost),
                        packaging_material:packaging_materials(unit_cost)`)
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
                    id: b.id + 10000, name: `📦 ${b.name}`, type: 'bundle',
                    salesPrice: price, unitCost: cost, quantity: b.quantity,
                    potentialRevenue: price * (b.quantity || 0),
                    marginAmount: margin, marginPercent: marginPct,
                    totalSold: 0, totalRevenue: 0
                });
            }

            return results;
        }
    });

    const sorted = useMemo(() => {
        if (!products) return [];
        let filtered = [...products];
        if (search) {
            filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
        }
        return filtered.sort((a, b) => {
            if (sortBy === 'name') return a.name.localeCompare(b.name);
            return b[sortBy] - a[sortBy];
        });
    }, [products, sortBy, search]);

    const totalRevenue = products?.reduce((s, p) => s + p.totalRevenue, 0) || 0;
    const totalPotential = products?.reduce((s, p) => s + p.potentialRevenue, 0) || 0;
    const avgMargin = products?.length ? products.filter(p => p.type === 'product').reduce((s, p) => s + p.marginPercent, 0) / products.filter(p => p.type === 'product').length : 0;

    // Top 5 by revenue for chart
    const topByRevenue = sorted.filter(p => p.totalRevenue > 0).slice(0, 8).map(p => ({
        name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
        revenue: p.totalRevenue,
        margin: p.marginPercent
    }));

    const getMarginColor = (pct: number) => {
        if (pct < 0) return 'text-red-600';
        if (pct < 15) return 'text-amber-600';
        return 'text-emerald-600';
    };

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader title="تقرير أداء المنتجات" description="تحليل الربحية، هوامش الربح، المبيعات الفعلية، والقيمة السوقية" icon={TrendingUp} />
                </div>
                <PrintButton />
            </div>

            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تقرير أداء المنتجات</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? <CardGridSkeleton count={3} /> : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">إجمالي المبيعات الفعلية</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-emerald-700">{formatCurrency(totalRevenue)}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">القيمة السوقية المتاحة</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-blue-700">{formatCurrency(totalPotential)}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-purple-700">متوسط هامش الربح</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-purple-700">{formatNumber(avgMargin)}%</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">عدد المنتجات</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{products?.length || 0} <span className="text-sm font-normal">منتج</span></div></CardContent>
                        </Card>
                    </div>

                    {/* Top Products Chart */}
                    {topByRevenue.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>أعلى المنتجات مبيعاً</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={topByRevenue} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 9 }} />
                                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ direction: 'rtl' }} />
                                            <Bar dataKey="revenue" name="الإيرادات" radius={[0, 4, 4, 0]}>
                                                {topByRevenue.map((entry, index) => (
                                                    <Cell key={index} fill={entry.margin >= 15 ? '#10b981' : entry.margin >= 0 ? '#f59e0b' : '#ef4444'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Products Table */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle>تفاصيل المنتجات</CardTitle>
                                    <CardDescription>اضغط على العناوين لتغيير الترتيب</CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input placeholder="بحث بالاسم..." value={search} onChange={e => setSearch(e.target.value)} className="w-[180px]" />
                                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                                        <SelectTrigger className="w-[160px]"><ArrowUpDown className="w-4 h-4 ml-2" /><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="totalRevenue">المبيعات الفعلية</SelectItem>
                                            <SelectItem value="marginPercent">هامش الربح</SelectItem>
                                            <SelectItem value="totalSold">الكمية المباعة</SelectItem>
                                            <SelectItem value="potentialRevenue">القيمة المتاحة</SelectItem>
                                            <SelectItem value="name">الاسم</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead className="text-center">التكلفة</TableHead>
                                        <TableHead className="text-center">السعر</TableHead>
                                        <TableHead className="text-center">الهامش</TableHead>
                                        <TableHead className="text-center">المخزون</TableHead>
                                        <TableHead className="text-center">المباع</TableHead>
                                        <TableHead className="text-center">إيرادات فعلية</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sorted.map(product => (
                                        <TableRow key={product.id} className={product.marginPercent < 0 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                    <span className="font-medium">{product.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-sm">{formatCurrency(product.unitCost)}</TableCell>
                                            <TableCell className="text-center font-mono text-sm">{formatCurrency(product.salesPrice)}</TableCell>
                                            <TableCell className="text-center">
                                                <div className={`flex items-center justify-center gap-1 font-bold text-sm ${getMarginColor(product.marginPercent)}`}>
                                                    {product.marginPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {formatNumber(product.marginPercent)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-mono">{formatNumber(product.quantity)}</TableCell>
                                            <TableCell className="text-center">
                                                {product.totalSold > 0 ? (
                                                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{formatNumber(product.totalSold)}</Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-sm font-bold text-emerald-600">
                                                {product.totalRevenue > 0 ? formatCurrency(product.totalRevenue) : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
