import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Download, Printer } from "lucide-react";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";

export default function InventoryReport() {
    
    const { data: items, isLoading } = useQuery({
        queryKey: ['report-inventory-valuation'],
        queryFn: async () => {
            const [raw, packaging, semi, finished] = await Promise.all([
                supabase.from('raw_materials').select('id, name, quantity, unit_cost, unit'),
                supabase.from('packaging_materials').select('id, name, quantity, unit_cost'),
                supabase.from('semi_finished_products').select('id, name, quantity, unit_cost'),
                supabase.from('finished_products').select('id, name, quantity, unit_cost')
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
                ...mapItems(finished.data || [], 'finished', 'منتج تام')
            ].sort((a, b) => b.totalValue - a.totalValue);
        }
    });

    const totalValuation = items?.reduce((sum, item) => sum + item.totalValue, 0) || 0;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <PageHeader
                    title="تقرير تقييم المخزون"
                    description="تحليل تفصيلي لقيمة المخزون الحالي وتكاليف الأصناف"
                    icon={Package}
                />
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        طباعة
                    </Button>
                    <Button variant="default">
                        <Download className="w-4 h-4 mr-2" />
                        تصدير Excel
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
                    {/* Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
                        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-blue-700">إجمالي قيمة المخزون</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-700">
                                    {totalValuation.toLocaleString()} ج.م
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-50 dark:bg-slate-900/20 border-slate-100">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">عدد الأصناف</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {items?.length || 0} صنف
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Detailed Table */}
                    <Card>
                        <CardHeader className="print:hidden">
                            <CardTitle>تفاصيل الأرصدة</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>الصنف</TableHead>
                                        <TableHead>النوع</TableHead>
                                        <TableHead className="text-center">الكمية الحالية</TableHead>
                                        <TableHead className="text-center">متوسط التكلفة</TableHead>
                                        <TableHead className="text-left">القيمة الإجمالية</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items?.map((item) => (
                                        <TableRow key={`${item.type}-${item.id}`}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={
                                                    item.type === 'raw' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    item.type === 'finished' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    'bg-slate-50 text-slate-700'
                                                }>
                                                    {item.typeLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center font-mono">
                                                {item.quantity} {item.unit || ''}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-muted-foreground">
                                                {item.unit_cost?.toLocaleString()} ج.م
                                            </TableCell>
                                            <TableCell className="text-left font-bold font-mono text-blue-600">
                                                {item.totalValue.toLocaleString()} ج.م
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
