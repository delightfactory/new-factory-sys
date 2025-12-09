import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import { TrendingUp, Printer, ArrowRight, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";

export default function ProductPerformanceReport() {

    const { data: products, isLoading } = useQuery({
        queryKey: ['report-product-performance'],
        queryFn: async () => {
            // Fetch finished products
            const { data } = await supabase
                .from('finished_products')
                .select('id, name, sales_price, quantity');

            // Calculate estimated value and potential revenue
            // In a real scenario, we would join with sales_invoice_items to get actual sales volume
            // For now, we show current catalogue performance
            return (data || []).map(p => ({
                ...p,
                potentialRevenue: (p.sales_price || 0) * (p.quantity || 0)
            })).sort((a, b) => b.potentialRevenue - a.potentialRevenue);
        }
    });

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تقرير أداء المنتجات"
                        description="تحليل الربحية والقيمة السوقية للمنتجات الحالية"
                        icon={TrendingUp}
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        طباعة
                    </Button>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تقرير أداء المنتجات</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={1} />
            ) : (
                <div className="space-y-6">
                    {/* Top Performers Cards */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-700">إجمالي القيمة السوقية</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-emerald-700">
                                    {products?.reduce((sum, p) => sum + p.potentialRevenue, 0).toLocaleString()} ج.م
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-blue-700">عدد المنتجات</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-700">
                                    {products?.length} منتج
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-purple-700">متوسط سعر البيع</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-purple-700">
                                    {Math.round((products || []).reduce((sum, p) => sum + (p.sales_price || 0), 0) / ((products?.length || 1))).toLocaleString()} ج.م
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>قائمة المنتجات</CardTitle>
                            <CardDescription>المنتجات مرتبة حسب القيمة البيعية المتوقعة للمخزون الحالي</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead className="text-center">الكمية المتاحة</TableHead>
                                        <TableHead className="text-center">سعر البيع</TableHead>
                                        <TableHead className="text-left">القيمة المتوقعة</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {products?.map((product) => (
                                        <TableRow key={product.id}>
                                            <TableCell className="font-medium flex items-center gap-2">
                                                <Package className="w-4 h-4 text-muted-foreground" />
                                                {product.name}
                                            </TableCell>
                                            <TableCell className="text-center font-mono">
                                                {product.quantity}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-muted-foreground">
                                                {product.sales_price?.toLocaleString()} ج.م
                                            </TableCell>
                                            <TableCell className="text-left font-bold font-mono text-emerald-600">
                                                {product.potentialRevenue.toLocaleString()} ج.م
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
