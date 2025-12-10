import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    RotateCcw,
    Calendar,
    User,
    FileText,
    Package,
    Banknote,
    CheckCircle,
    Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

interface Return {
    id: number;
    code: string;
    return_type: 'sales' | 'purchase';
    party_id: string;
    invoice_id?: number;
    return_date: string;
    total_amount: number;
    status: 'draft' | 'posted' | 'void';
    reason?: string;
    notes?: string;
    created_at: string;
    party?: { name: string };
}

interface ReturnItem {
    id: number;
    item_type: string;
    item_id: number;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_name?: string;
}

export default function ReturnDetails() {
    const { id, type } = useParams<{ id: string; type: string }>();
    const navigate = useNavigate();

    const tableName = type === 'sales' ? 'sales_returns' : 'purchase_returns';
    const itemsTable = type === 'sales' ? 'sales_return_items' : 'purchase_return_items';

    // Fetch return details
    const { data: returnData, isLoading: returnLoading } = useQuery({
        queryKey: ['return', type, id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(tableName)
                .select('*, party:parties(name)')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as Return;
        },
        enabled: !!id && !!type
    });

    // Fetch return items
    const { data: items } = useQuery({
        queryKey: ['return-items', type, id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(itemsTable)
                .select('*')
                .eq('return_id', id);
            if (error) throw error;
            return data as ReturnItem[];
        },
        enabled: !!id && !!type
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'posted':
                return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 ml-1" />معتمد</Badge>;
            case 'void':
                return <Badge variant="destructive">ملغي</Badge>;
            default:
                return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 ml-1" />مسودة</Badge>;
        }
    };

    if (returnLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={3} />
            </div>
        );
    }

    if (!returnData) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">المرتجع غير موجود</p>
                <Button onClick={() => navigate(-1)} className="mt-4">
                    <ArrowLeft className="ml-2 h-4 w-4" /> عودة
                </Button>
            </div>
        );
    }

    const totalItems = items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${type === 'sales' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-cyan-100 dark:bg-cyan-900/30'}`}>
                            <RotateCcw className={`h-6 w-6 ${type === 'sales' ? 'text-orange-600 dark:text-orange-400' : 'text-cyan-600 dark:text-cyan-400'}`} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">
                                مرتجع {type === 'sales' ? 'مبيعات' : 'مشتريات'} #{returnData.code}
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(returnData.status)}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-2xl font-bold text-foreground">
                    {returnData.total_amount.toLocaleString('ar-EG')} ج.م
                    <span className="block text-xs font-normal text-muted-foreground">إجمالي المرتجع</span>
                </div>
            </div>

            {/* Return Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">معلومات المرتجع</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">التاريخ</span>
                                <span className="font-medium">{format(new Date(returnData.return_date), 'dd/MM/yyyy')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50"
                            onClick={() => returnData.party_id && navigate(`/commercial/parties/${returnData.party_id}`)}>
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">{type === 'sales' ? 'العميل' : 'المورد'}</span>
                                <span className="font-medium text-primary">{returnData.party?.name || '-'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Package className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">عدد الأصناف</span>
                                <span className="font-medium">{items?.length || 0} صنف</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Banknote className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">إجمالي الكميات</span>
                                <span className="font-medium">{totalItems.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Reason */}
            {returnData.reason && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            سبب المرتجع
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed">{returnData.reason}</p>
                    </CardContent>
                </Card>
            )}

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
                            <RotateCcw className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">إجمالي الكميات</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">{totalItems.toLocaleString()}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Banknote className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm text-purple-700 dark:text-purple-300">قيمة المرتجع</span>
                        </div>
                        <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{returnData.total_amount.toLocaleString()} ج.م</p>
                    </CardContent>
                </Card>
            </div>

            {/* Return Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">بنود المرتجع</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {items && items.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>سعر الوحدة</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Badge variant="outline">{item.item_type}</Badge>
                                            </TableCell>
                                            <TableCell>{item.quantity.toLocaleString()}</TableCell>
                                            <TableCell>{(item.unit_price || 0).toLocaleString()} ج.م</TableCell>
                                            <TableCell className="font-bold">{(item.total_price || 0).toLocaleString()} ج.م</TableCell>
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

            {/* Notes */}
            {returnData.notes && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            ملاحظات
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed">{returnData.notes}</p>
                    </CardContent>
                </Card>
            )}

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ الإنشاء: {format(new Date(returnData.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
