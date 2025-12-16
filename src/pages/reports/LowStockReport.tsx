import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { PrintButton } from "@/components/print/PrintLayout";

export default function LowStockReport() {

    const { data: items, isLoading } = useQuery({
        queryKey: ['report-low-stock'],
        queryFn: async () => {
            const raw = await supabase.from('raw_materials').select('id, name, quantity, min_stock, unit');

            return (raw.data || [])
                .filter(item => item.quantity <= (item.min_stock || 0))
                .sort((a, b) => (a.quantity / (a.min_stock || 1)) - (b.quantity / (b.min_stock || 1)));
        }
    });



    return (
        <div className="space-y-6 print:space-y-2">
            {/* Header - Responsive */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تقرير نواقص المخزون"
                        description="الأصناف التي وصلت للحد الأدنى"
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
                    تقرير نواقص المخزون
                </h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={1} />
            ) : items?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100">
                    <div className="p-4 bg-green-100 dark:bg-green-800/30 rounded-full mb-4">
                        <Badge className="w-8 h-8 rounded-full bg-green-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">المخزون آمن</h3>
                    <p className="text-muted-foreground text-sm">لا توجد أصناف تحت الحد الأدنى حالياً.</p>
                </div>
            ) : (
                <Card className="border-red-200 dark:border-red-900/50">
                    <CardHeader className="bg-red-50/50 dark:bg-red-900/20 print:bg-transparent">
                        <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            {items?.length} أصناف حرجة
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6">
                        {/* Desktop Table - Hidden on Mobile */}
                        <div className="hidden sm:block">
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
                                        <TableRow key={item.id} className="hover:bg-red-50/30 dark:hover:bg-red-900/10">
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell className="text-center font-bold text-red-600">
                                                {item.quantity} {item.unit}
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-muted-foreground">
                                                {item.min_stock} {item.unit}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {item.quantity === 0 ? (
                                                    <Badge variant="destructive">نافذ</Badge>
                                                ) : (
                                                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">منخفض</Badge>
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
                        </div>

                        {/* Mobile Cards - Visible only on Mobile */}
                        <div className="sm:hidden space-y-3 p-4">
                            {items?.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-4 rounded-lg border border-red-200 dark:border-red-900/50 bg-gradient-to-r from-red-50/50 to-transparent dark:from-red-900/10"
                                >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <h3 className="font-medium">{item.name}</h3>
                                            {item.quantity === 0 ? (
                                                <Badge variant="destructive" className="mt-1">نافذ تماماً</Badge>
                                            ) : (
                                                <Badge className="bg-amber-100 text-amber-800 mt-1">منخفض</Badge>
                                            )}
                                        </div>
                                        <Button size="sm" variant="outline" className="shrink-0 border-red-200 text-red-700" asChild>
                                            <Link to={`/commercial/buying?item=${item.id}`}>
                                                <ShoppingCart className="w-4 h-4" />
                                            </Link>
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="p-2 rounded bg-red-100/50 dark:bg-red-900/20">
                                            <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                                            <p className="font-bold text-red-600">{item.quantity} {item.unit}</p>
                                        </div>
                                        <div className="p-2 rounded bg-muted/50">
                                            <p className="text-xs text-muted-foreground">الحد الأدنى</p>
                                            <p className="font-mono">{item.min_stock} {item.unit}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
