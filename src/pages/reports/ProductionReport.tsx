import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Factory, Printer, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { format } from "date-fns";

export default function ProductionReport() {

    // Fetch aggregated production stats
    const { data: stats, isLoading } = useQuery({
        queryKey: ['report-production'],
        queryFn: async () => {
            // 1. Fetch Orders
            const { data: orders } = await supabase
                .from('production_orders')
                // Removed relation fetch temporarily to fix 400 error. 
                // In generic schema, production_orders might link via items or use a different column name.
                // We will fetch plain orders for now.
                .select('id, status, created_at, created_by')
                .order('created_at', { ascending: false })
                .limit(50);

            const totalOrders = orders?.length || 0;
            const completedOrders = orders?.filter(o => o.status === 'completed').length || 0;
            const pendingOrders = orders?.filter(o => o.status === 'pending' || o.status === 'inProgress').length || 0;
            const cancelledOrders = orders?.filter(o => o.status === 'cancelled').length || 0;

            // Calculate Efficiency (Produced / Planned) for completed orders
            const completedList = orders?.filter(o => o.status === 'completed') || [];
            const avgEfficiency = totalOrders > 0 ? (completedList.length / totalOrders) * 100 : 0;

            return {
                orders: orders || [],
                totalOrders,
                completedOrders,
                pendingOrders,
                cancelledOrders,
                avgEfficiency: Math.round(avgEfficiency * 100)
            };
        }
    });

    const handlePrint = () => {
        window.print();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">مكتمل</Badge>;
            case 'inProgress': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">جاري التنفيذ</Badge>;
            case 'pending': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">قيد الانتظار</Badge>;
            case 'cancelled': return <Badge variant="destructive">ملغي</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6 print:space-y-4">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="تقرير كفاءة الإنتاج"
                        description="تحليل أداء خطوط الإنتاج وتنفيذ الأوامر"
                        icon={Factory}
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        طباعة
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={2} />
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
                        <Card className="bg-blue-50 dark:bg-blue-900/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-blue-600">إجمالي الأوامر</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats?.totalOrders}</div>
                            </CardContent>
                        </Card>
                        <Card className="bg-green-50 dark:bg-green-900/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-green-600">مكتملة</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                    {stats?.completedOrders}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-amber-50 dark:bg-amber-900/20">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-amber-600">قيد التنفيذ</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    {stats?.pendingOrders}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">نسبة الكفاءة</CardTitle>
                                <CardDescription>نسبة الأوامر المكتملة</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${stats?.avgEfficiency! >= 90 ? 'text-green-600' : 'text-orange-500'}`}>
                                    {stats?.avgEfficiency}%
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Orders Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>سجل أوامر التشغيل (آخر 50 أمر)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead>الحالة</TableHead>
                                        <TableHead className="text-left">تاريخ الإنشاء</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats?.orders.map((order: any) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-medium">{order.finished_product?.name || 'غير محدد'}</TableCell>
                                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                                            <TableCell className="text-left text-muted-foreground text-sm">
                                                {format(new Date(order.created_at), 'dd/MM/yyyy')}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
