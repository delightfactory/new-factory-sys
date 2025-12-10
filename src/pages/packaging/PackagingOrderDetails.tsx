import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    Factory,
    Calendar,
    Package,
    CheckCircle,
    Clock,
    XCircle,
    Beaker
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import { Progress } from '@/components/ui/progress';

interface PackagingOrder {
    id: number;
    code: string;
    date: string;
    status: 'pending' | 'inProgress' | 'completed' | 'cancelled';
    notes?: string;
    created_at: string;
}

interface OrderItem {
    id: number;
    finished_product_id: number;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    finished_products?: { name: string; unit: string };
}

export default function PackagingOrderDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch order details
    const { data: order, isLoading: orderLoading } = useQuery({
        queryKey: ['packaging-order', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('packaging_orders')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as PackagingOrder;
        },
        enabled: !!id
    });

    // Fetch order items
    const { data: items } = useQuery({
        queryKey: ['packaging-order-items', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('packaging_order_items')
                .select('*, finished_products(name, unit)')
                .eq('packaging_order_id', id);
            if (error) throw error;
            return data as OrderItem[];
        },
        enabled: !!id
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 ml-1" />مكتمل</Badge>;
            case 'inProgress':
                return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="w-3 h-3 ml-1" />قيد التنفيذ</Badge>;
            case 'cancelled':
                return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3 ml-1" />ملغي</Badge>;
            default:
                return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 ml-1" />معلق</Badge>;
        }
    };

    const totalCost = items?.reduce((sum, item) => sum + (item.total_cost || 0), 0) || 0;
    const totalItems = items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

    // Calculate progress
    const getProgress = (status: string) => {
        switch (status) {
            case 'completed': return 100;
            case 'inProgress': return 50;
            case 'cancelled': return 0;
            default: return 10;
        }
    };

    if (orderLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={3} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الأمر غير موجود</p>
                <Button onClick={() => navigate(-1)} className="mt-4">
                    <ArrowLeft className="ml-2 h-4 w-4" /> عودة
                </Button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                            <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">أمر تعبئة #{order.code}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(order.status)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">تقدم الأمر</span>
                        <span className="text-sm text-muted-foreground">{getProgress(order.status)}%</span>
                    </div>
                    <Progress value={getProgress(order.status)} className="h-3" />
                </CardContent>
            </Card>

            {/* Order Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">معلومات الأمر</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">تاريخ الأمر</span>
                                <span className="font-medium">{format(new Date(order.date), 'dd/MM/yyyy')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">عدد الأصناف</span>
                                <span className="font-medium">{items?.length || 0} صنف</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Beaker className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">إجمالي الكميات</span>
                                <span className="font-medium">{totalItems.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                    {order.notes && (
                        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                            <span className="text-xs text-muted-foreground block mb-1">ملاحظات</span>
                            <p className="text-sm">{order.notes}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">عدد البنود</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{items?.length || 0}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Beaker className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">إجمالي التعبئة</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">{totalItems.toLocaleString()}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Factory className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm text-purple-700 dark:text-purple-300">إجمالي التكلفة</span>
                        </div>
                        <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{totalCost.toLocaleString()} ج.م</p>
                    </CardContent>
                </Card>
            </div>

            {/* Order Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">بنود الأمر</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {items && items.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>تكلفة الوحدة</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    {item.finished_products?.name || `منتج #${item.finished_product_id}`}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {item.quantity.toLocaleString()} {item.finished_products?.unit || ''}
                                            </TableCell>
                                            <TableCell>{(item.unit_cost || 0).toLocaleString()} ج.م</TableCell>
                                            <TableCell className="font-bold">{(item.total_cost || 0).toLocaleString()} ج.م</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-muted-foreground">
                            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>لا توجد بنود</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ الإنشاء: {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
