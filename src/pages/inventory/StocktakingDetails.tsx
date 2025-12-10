import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    ClipboardList,
    Calendar,
    Package,
    Check,
    Clock,
    AlertTriangle,
    TrendingUp,
    TrendingDown
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import { Progress } from '@/components/ui/progress';

interface StocktakingSession {
    id: number;
    code: string;
    name: string;
    status: 'open' | 'closed';
    start_date: string;
    end_date?: string;
    notes?: string;
    created_at: string;
}

interface CountItem {
    id: number;
    item_type: string;
    item_id: number;
    expected_quantity: number;
    actual_quantity: number;
    difference: number;
    item_name?: string;
}

export default function StocktakingDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch session details
    const { data: session, isLoading: sessionLoading } = useQuery({
        queryKey: ['stocktaking-session', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('inventory_count_sessions')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as StocktakingSession;
        },
        enabled: !!id
    });

    // Fetch count items
    const { data: items } = useQuery({
        queryKey: ['stocktaking-items', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('inventory_count_items')
                .select('*')
                .eq('session_id', id);
            if (error) throw error;
            return data as CountItem[];
        },
        enabled: !!id
    });

    // Calculate stats
    const totalItems = items?.length || 0;
    const itemsWithDifference = items?.filter(i => i.difference !== 0).length || 0;
    const totalPositive = items?.filter(i => i.difference > 0).reduce((s, i) => s + i.difference, 0) || 0;
    const totalNegative = items?.filter(i => i.difference < 0).reduce((s, i) => s + Math.abs(i.difference), 0) || 0;
    const accuracy = totalItems > 0 ? ((totalItems - itemsWithDifference) / totalItems) * 100 : 100;

    if (sessionLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={4} />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الجلسة غير موجودة</p>
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
                        <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
                            <ClipboardList className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">{session.name || session.code}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant={session.status === 'closed' ? 'default' : 'secondary'}>
                                    {session.status === 'closed' ? (
                                        <><Check className="w-3 h-3 ml-1" />مغلقة</>
                                    ) : (
                                        <><Clock className="w-3 h-3 ml-1" />مفتوحة</>
                                    )}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Accuracy Progress */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">نسبة الدقة</span>
                        <span className={`text-sm font-bold ${accuracy >= 95 ? 'text-green-600' : accuracy >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                            {accuracy.toFixed(1)}%
                        </span>
                    </div>
                    <Progress value={accuracy} className="h-3" />
                    <p className="text-xs text-muted-foreground mt-2">
                        {totalItems - itemsWithDifference} من {totalItems} صنف متطابق
                    </p>
                </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">معلومات الجلسة</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">تاريخ البدء</span>
                                <span className="font-medium">{format(new Date(session.start_date), 'dd/MM/yyyy')}</span>
                            </div>
                        </div>
                        {session.end_date && (
                            <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <span className="text-xs text-muted-foreground block">تاريخ الإغلاق</span>
                                    <span className="font-medium">{format(new Date(session.end_date), 'dd/MM/yyyy')}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">عدد الأصناف</span>
                                <span className="font-medium">{totalItems} صنف</span>
                            </div>
                        </div>
                    </div>
                    {session.notes && (
                        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                            <span className="text-xs text-muted-foreground block mb-1">ملاحظات</span>
                            <p className="text-sm">{session.notes}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">إجمالي الأصناف</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{totalItems}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">فروقات</span>
                        </div>
                        <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{itemsWithDifference}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">زيادة</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">+{totalPositive}</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm text-red-700 dark:text-red-300">عجز</span>
                        </div>
                        <p className="text-xl font-bold text-red-900 dark:text-red-100">-{totalNegative}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Items Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">بنود الجرد</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {items && items.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>المتوقع</TableHead>
                                        <TableHead>الفعلي</TableHead>
                                        <TableHead>الفرق</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Badge variant="outline">{item.item_type}</Badge>
                                            </TableCell>
                                            <TableCell>{item.expected_quantity.toLocaleString()}</TableCell>
                                            <TableCell>{item.actual_quantity.toLocaleString()}</TableCell>
                                            <TableCell>
                                                <span className={`font-bold ${item.difference > 0 ? 'text-green-600 dark:text-green-400' : item.difference < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                                    {item.difference > 0 ? '+' : ''}{item.difference.toLocaleString()}
                                                </span>
                                            </TableCell>
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
                <span>تاريخ الإنشاء: {format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
