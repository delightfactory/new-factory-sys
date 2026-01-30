import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Download, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { PrintButton } from "@/components/print/PrintLayout";

const TYPE_COLORS: Record<string, string> = {
    raw: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    packaging: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
    semi: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
    finished: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
    bundle: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400'
};

export default function InventoryReport() {

    const { data: items, isLoading } = useQuery({
        queryKey: ['report-inventory-valuation'],
        queryFn: async () => {
            const [raw, packaging, semi, finished, bundles] = await Promise.all([
                supabase.from('raw_materials').select('id, name, quantity, unit_cost, unit'),
                supabase.from('packaging_materials').select('id, name, quantity, unit_cost'),
                supabase.from('semi_finished_products').select('id, name, quantity, unit_cost'),
                supabase.from('finished_products').select('id, name, quantity, unit_cost'),
                supabase.from('product_bundles').select('id, name, quantity, unit_cost').eq('is_active', true)
            ]);

            const mapItems = (data: any[], type: string, typeLabel: string) =>
                (data || []).map(item => ({
                    ...item,
                    type,
                    typeLabel,
                    totalValue: (item.quantity || 0) * (item.unit_cost || 0)
                }));

            return [
                ...mapItems(raw.data || [], 'raw', 'مادة خام'),
                ...mapItems(packaging.data || [], 'packaging', 'مادة تعبئة'),
                ...mapItems(semi.data || [], 'semi', 'نصف مصنع'),
                ...mapItems(finished.data || [], 'finished', 'منتج تام'),
                ...mapItems(bundles.data || [], 'bundle', 'باندل')
            ].sort((a, b) => b.totalValue - a.totalValue);
        }
    });

    const totalValuation = items?.reduce((sum, item) => sum + item.totalValue, 0) || 0;



    return (
        <div className="space-y-6 print:space-y-2">
            {/* Header - Responsive */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تقرير تقييم المخزون"
                        description="تحليل قيمة المخزون الحالي"
                        icon={Package}
                    />
                </div>
                <div className="flex gap-2 mr-auto sm:mr-0">
                    <PrintButton />
                    <Button size="sm">
                        <Download className="w-4 h-4 ml-2" />
                        تصدير
                    </Button>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">تقرير تقييم المخزون</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={1} />
            ) : (
                <div className="space-y-6">
                    {/* Summary Cards - Responsive */}
                    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
                        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-100 col-span-2 lg:col-span-1">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">إجمالي قيمة المخزون</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-400">
                                    {totalValuation.toLocaleString()} ج.م
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-50 dark:bg-slate-900/20 border-slate-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">عدد الأصناف</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl lg:text-2xl font-bold">
                                    {items?.length || 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="hidden lg:block">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">تحليل متقدم</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Button variant="outline" size="sm" asChild className="w-full">
                                    <Link to="/reports/inventory-analytics">عرض التحليل</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detailed Table with horizontal scroll */}
                    <Card>
                        <CardHeader className="print:hidden">
                            <CardTitle>تفاصيل الأرصدة</CardTitle>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
                            <div className="min-w-[500px]">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>الصنف</TableHead>
                                            <TableHead>النوع</TableHead>
                                            <TableHead className="text-center">الكمية</TableHead>
                                            <TableHead className="text-center">م.التكلفة</TableHead>
                                            <TableHead className="text-left">القيمة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items?.map((item) => (
                                            <TableRow key={`${item.type}-${item.id}`}>
                                                <TableCell className="font-medium">{item.name}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={TYPE_COLORS[item.type] || ''}>
                                                        {item.typeLabel}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-mono">
                                                    {item.quantity} {item.unit || ''}
                                                </TableCell>
                                                <TableCell className="text-center font-mono text-muted-foreground text-sm">
                                                    {item.unit_cost?.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-left font-bold font-mono text-blue-600">
                                                    {item.totalValue.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
