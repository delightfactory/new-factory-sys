import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Printer, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";

export default function LowStockReport() {

    const { data: items, isLoading } = useQuery({
        queryKey: ['report-low-stock'],
        queryFn: async () => {
            // Fetch all raw materials and filter in application layer for accuracy
            const raw = await supabase.from('raw_materials').select('id, name, quantity, min_stock, unit');

            return (raw.data || [])
                .filter(item => item.quantity <= (item.min_stock || 0))
                .sort((a, b) => (a.quantity / (a.min_stock || 1)) - (b.quantity / (b.min_stock || 1))); // Sort by criticality (percentage of min_stock)
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
                        title="تقرير نواقص المخزون"
                        description="الأصناف التي وصلت للحد الأدنى وتحتاج إعادة طلب"
                        icon={AlertTriangle}
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
                <h1 className="text-2xl font-bold text-red-600 flex items-center justify-center gap-2">
                    <AlertTriangle className="w-6 h-6" />
                    تقرير نواقص المخزون
                </h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={1} />
            ) : items?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-green-50 rounded-lg border border-green-100">
                    <div className="p-4 bg-green-100 rounded-full mb-4">
                        <Badge className="w-8 h-8 rounded-full bg-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-green-700">المخزون آمن</h3>
                    <p className="text-muted-foreground">لا توجد أصناف تحت الحد الأدنى حالياً.</p>
                </div>
            ) : (
                <Card className="border-red-100">
                    <CardHeader className="bg-red-50/50 print:bg-transparent">
                        <CardTitle className="text-red-700 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            {items?.length} أصناف حرجة
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>الصنف</TableHead>
                                    <TableHead className="text-center">الرصيد الحالي</TableHead>
                                    <TableHead className="text-center">الحد الأدنى</TableHead>
                                    <TableHead className="text-center">الحالة</TableHead>
                                    <TableHead className="text-left print:hidden">الإجراء</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items?.map((item) => (
                                    <TableRow key={item.id} className="hover:bg-red-50/10">
                                        <TableCell className="font-medium text-lg">{item.name}</TableCell>
                                        <TableCell className="text-center font-bold text-red-600 text-lg">
                                            {item.quantity} {item.unit}
                                        </TableCell>
                                        <TableCell className="text-center font-mono text-muted-foreground">
                                            {item.min_stock} {item.unit}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {item.quantity === 0 ? (
                                                <Badge variant="destructive">نافذ تماماً</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">منخفض</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-left print:hidden">
                                            <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" asChild>
                                                <Link to={`/commercial/buying?item=${item.id}`}>طلب شراء</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
