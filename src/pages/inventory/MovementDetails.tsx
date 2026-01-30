import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    ArrowUpRight,
    ArrowDownLeft,
    Calendar,
    Package,
    FileText,
    Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

interface Movement {
    id: number;
    code: string;
    item_type: string;
    item_id: number;
    movement_type: 'in' | 'out' | 'adjustment';
    quantity: number;
    unit_cost: number;
    total_cost: number;
    reference_type?: string;
    reference_id?: number;
    notes?: string;
    created_at: string;
    created_by?: string;
}

export default function MovementDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch movement details
    const { data: movement, isLoading } = useQuery({
        queryKey: ['inventory-movement', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('inventory_movements')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as Movement;
        },
        enabled: !!id
    });

    const getMovementTypeLabel = (type: string) => {
        switch (type) {
            case 'in': return { label: 'إضافة', icon: ArrowDownLeft, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
            case 'out': return { label: 'صرف', icon: ArrowUpRight, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
            default: return { label: 'تسوية', icon: Package, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' };
        }
    };

    const getItemTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            'raw_material': 'مادة خام',
            'raw_materials': 'مادة خام',
            'packaging_material': 'مادة تعبئة',
            'packaging_materials': 'مادة تعبئة',
            'semi_finished': 'نصف مصنع',
            'semi_finished_products': 'نصف مصنع',
            'finished': 'منتج نهائي',
            'finished_products': 'منتج نهائي',
            'product_bundles': 'باندل',
            'bundle': 'باندل'
        };
        return labels[type] || type;
    };

    const getReferenceTypeLabel = (type?: string) => {
        if (!type) return '-';
        const labels: Record<string, string> = {
            'purchase_invoice': 'فاتورة شراء',
            'sales_invoice': 'فاتورة مبيعات',
            'production_order': 'أمر إنتاج',
            'stocktaking': 'جرد',
            'return': 'مرتجع'
        };
        return labels[type] || type;
    };

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={2} />
            </div>
        );
    }

    if (!movement) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الحركة غير موجودة</p>
                <Button onClick={() => navigate(-1)} className="mt-4">
                    <ArrowLeft className="ml-2 h-4 w-4" /> عودة
                </Button>
            </div>
        );
    }

    const typeInfo = getMovementTypeLabel(movement.movement_type);
    const TypeIcon = typeInfo.icon;

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${typeInfo.bg}`}>
                            <TypeIcon className={`h-6 w-6 ${typeInfo.color}`} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">حركة مخزون #{movement.code || movement.id}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge className={typeInfo.bg + ' ' + typeInfo.color}>
                                    {typeInfo.label}
                                </Badge>
                                <Badge variant="outline">{getItemTypeLabel(movement.item_type)}</Badge>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`text-2xl font-bold ${movement.movement_type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {movement.movement_type === 'in' ? '+' : '-'}{movement.quantity.toLocaleString()}
                    <span className="block text-xs font-normal text-muted-foreground">الكمية</span>
                </div>
            </div>

            {/* Movement Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">تفاصيل الحركة</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">التاريخ</span>
                                <span className="font-medium">{format(new Date(movement.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Package className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">نوع الصنف</span>
                                <span className="font-medium">{getItemTypeLabel(movement.item_type)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Hash className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">رقم الصنف</span>
                                <span className="font-medium">#{movement.item_id}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">المرجع</span>
                                <span className="font-medium">{getReferenceTypeLabel(movement.reference_type)}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Financial Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className={`${movement.movement_type === 'in' ? 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800' : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-800'}`}>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className={`h-4 w-4 ${movement.movement_type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                            <span className={`text-sm ${movement.movement_type === 'in' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>الكمية</span>
                        </div>
                        <p className={`text-xl font-bold ${movement.movement_type === 'in' ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
                            {movement.movement_type === 'in' ? '+' : '-'}{movement.quantity.toLocaleString()}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">تكلفة الوحدة</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{(movement.unit_cost || 0).toLocaleString()} ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm text-purple-700 dark:text-purple-300">إجمالي التكلفة</span>
                        </div>
                        <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{(movement.total_cost || 0).toLocaleString()} ج.م</p>
                    </CardContent>
                </Card>
            </div>

            {/* Notes */}
            {movement.notes && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            ملاحظات
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed">{movement.notes}</p>
                    </CardContent>
                </Card>
            )}

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ التسجيل: {format(new Date(movement.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
