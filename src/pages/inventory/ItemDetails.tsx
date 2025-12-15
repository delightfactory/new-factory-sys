import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    Package,
    History,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowUpDown,
    Layers,
    AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface ItemData {
    id: number;
    name: string;
    code: string;
    unit: string;
    quantity: number;
    unit_cost: number;
    min_stock?: number;
    // For Finished Products
    semi_finished_id?: number;
    semi_finished_quantity?: number;
}

interface Movement {
    id: number;
    movement_type: string;
    quantity: number;
    reason: string;
    created_at: string;
    previous_balance: number;
    new_balance: number;
}

interface Ingredient {
    id: number;
    raw_material_id?: number;
    quantity: number;
    percentage?: number;
    raw_materials?: { name: string; unit: string };
}

interface PackagingIngredient {
    id: number;
    packaging_material_id: number;
    quantity: number;
    packaging_materials?: { name: string; unit: string };
}

interface UsedInItem {
    id: number;
    product_name: string;
    product_code: string;
    type: 'semi' | 'finished';
}

// Map URL path to table name
const PATH_TO_TABLE: Record<string, string> = {
    'raw-materials': 'raw_materials',
    'packaging': 'packaging_materials',
    'semi-finished': 'semi_finished_products',
    'finished': 'finished_products'
};

const PATH_TO_LABEL: Record<string, string> = {
    'raw-materials': 'مادة خام',
    'packaging': 'مادة تعبئة',
    'semi-finished': 'نصف مصنع',
    'finished': 'منتج نهائي'
};

const MOVEMENT_CONFIG = {
    in: { label: 'دخول', icon: ArrowUpRight, color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
    out: { label: 'خروج', icon: ArrowDownLeft, color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
    adjustment: { label: 'تسوية', icon: ArrowUpDown, color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' }
};

export default function ItemDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine item type from URL
    const pathParts = location.pathname.split('/');
    const itemTypePath = pathParts[2]; // inventory/{type}/{id}
    const tableName = PATH_TO_TABLE[itemTypePath] || 'raw_materials';
    const typeLabel = PATH_TO_LABEL[itemTypePath] || 'صنف';

    // Fetch item details
    const { data: item, isLoading } = useQuery({
        queryKey: ['item', tableName, id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as ItemData;
        },
        enabled: !!id
    });

    // Fetch movements
    const { data: movements } = useQuery({
        queryKey: ['item-movements', tableName, id],
        queryFn: async () => {
            const { data } = await supabase
                .from('inventory_movements')
                .select('*')
                .eq('item_type', tableName)
                .eq('item_id', Number(id))
                .order('created_at', { ascending: false })
                .limit(30);
            return data as Movement[] || [];
        },
        enabled: !!id
    });

    // Fetch ingredients (for semi-finished)
    const { data: ingredients } = useQuery({
        queryKey: ['item-ingredients', id],
        queryFn: async () => {
            const { data } = await supabase
                .from('semi_finished_ingredients')
                .select('*, raw_materials(name, unit)')
                .eq('semi_finished_id', Number(id));
            return data as Ingredient[] || [];
        },
        enabled: itemTypePath === 'semi-finished' && !!id
    });

    // Fetch Packaging (for finished)
    const { data: finishedPackaging } = useQuery({
        queryKey: ['finished-packaging', id],
        queryFn: async () => {
            const { data } = await supabase
                .from('finished_product_packaging')
                .select('*, packaging_materials(name, unit)')
                .eq('finished_product_id', Number(id));
            return data as PackagingIngredient[] || [];
        },
        enabled: itemTypePath === 'finished' && !!id
    });

    // Fetch Base Semi-Finished (for finished)
    const { data: baseSemiFinished } = useQuery({
        queryKey: ['base-semi', item?.semi_finished_id],
        queryFn: async () => {
            if (!item?.semi_finished_id) return null;
            const { data } = await supabase
                .from('semi_finished_products')
                .select('name, unit, code')
                .eq('id', item.semi_finished_id)
                .single();
            return data;
        },
        enabled: itemTypePath === 'finished' && !!item?.semi_finished_id
    });

    // Fetch "Used In" (for Raw or Packaging)
    const { data: usedIn } = useQuery({
        queryKey: ['used-in', tableName, id],
        queryFn: async () => {
            const list: UsedInItem[] = [];

            if (itemTypePath === 'raw-materials') {
                const { data } = await supabase
                    .from('semi_finished_ingredients')
                    .select('semi_finished_products(id, name, code)')
                    .eq('raw_material_id', Number(id));

                data?.forEach((d: any) => {
                    if (d.semi_finished_products) {
                        list.push({
                            id: d.semi_finished_products.id,
                            product_name: d.semi_finished_products.name,
                            product_code: d.semi_finished_products.code,
                            type: 'semi'
                        });
                    }
                });
            } else if (itemTypePath === 'packaging') {
                const { data } = await supabase
                    .from('finished_product_packaging')
                    .select('finished_products(id, name, code)')
                    .eq('packaging_material_id', Number(id));

                data?.forEach((d: any) => {
                    if (d.finished_products) {
                        list.push({
                            id: d.finished_products.id,
                            product_name: d.finished_products.name,
                            product_code: d.finished_products.code,
                            type: 'finished'
                        });
                    }
                });
            }
            return list;
        },
        enabled: (itemTypePath === 'raw-materials' || itemTypePath === 'packaging') && !!id
    });

    // Stock status
    const getStockStatus = (item: ItemData) => {
        if (!item.min_stock) return { label: 'طبيعي', variant: 'default' as const };
        if (item.quantity <= 0) return { label: 'نفد', variant: 'destructive' as const };
        if (item.quantity < item.min_stock) return { label: 'منخفض', variant: 'secondary' as const };
        return { label: 'متوفر', variant: 'default' as const };
    };

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={3} />
            </div>
        );
    }

    if (!item) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الصنف غير موجود</p>
                <Button onClick={() => navigate(-1)} className="mt-4">
                    <ArrowLeft className="ml-2 h-4 w-4" /> عودة
                </Button>
            </div>
        );
    }

    const stockStatus = getStockStatus(item);
    const totalValue = item.quantity * (item.unit_cost || 0);

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-primary/10">
                            <Package className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">{item.name}</h1>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline">{typeLabel}</Badge>
                                <span className="text-muted-foreground font-mono text-sm">{item.code}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <Badge variant={stockStatus.variant} className="text-base px-4 py-1">
                    {stockStatus.label}
                </Badge>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <span className="text-sm text-blue-700 dark:text-blue-300">الكمية الحالية</span>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                            {formatNumber(item.quantity)} <span className="text-sm font-normal">{item.unit}</span>
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <span className="text-sm text-green-700 dark:text-green-300">سعر الوحدة</span>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                            {formatCurrency(item.unit_cost || 0)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <span className="text-sm text-purple-700 dark:text-purple-300">القيمة الإجمالية</span>
                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                            {formatCurrency(totalValue)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                        <span className="text-sm text-amber-700 dark:text-amber-300">الحد الأدنى</span>
                        <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
                            {formatNumber(item.min_stock || 0)} <span className="text-sm font-normal">{item.unit}</span>
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Low Stock Warning */}
            {item.min_stock && item.quantity < item.min_stock && (
                <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        <span className="text-amber-800 dark:text-amber-200">
                            الكمية أقل من الحد الأدنى! يُنصح بإعادة التوريد.
                        </span>
                    </CardContent>
                </Card>
            )}

            {/* Ingredients (for semi-finished) */}
            {itemTypePath === 'semi-finished' && ingredients && ingredients.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5" />
                            المكونات
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>المادة الخام</TableHead>
                                    <TableHead>الكمية</TableHead>
                                    <TableHead>النسبة</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ingredients.map(ing => (
                                    <TableRow key={ing.id}>
                                        <TableCell>{ing.raw_materials?.name}</TableCell>
                                        <TableCell>{ing.quantity} {ing.raw_materials?.unit}</TableCell>
                                        <TableCell>{ing.percentage}%</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Recipe (for Finished Products) */}
            {itemTypePath === 'finished' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5" />
                            تركيبة المنتج
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Base Product */}
                        {baseSemiFinished && (
                            <div className="bg-muted/30 p-4 rounded-lg border">
                                <h4 className="text-sm font-bold mb-2 text-primary">المنتج الأساسي (نصف مصنع)</h4>
                                <div className="flex justify-between items-center">
                                    <span>{baseSemiFinished.name} <span className="text-xs text-muted-foreground">({baseSemiFinished.code})</span></span>
                                    <Badge variant="outline">{item.semi_finished_quantity} {baseSemiFinished.unit}</Badge>
                                </div>
                            </div>
                        )}

                        {/* Packaging Materials */}
                        {finishedPackaging && finishedPackaging.length > 0 && (
                            <div>
                                <h4 className="text-sm font-bold mb-2">مواد التعبئة</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>مادة التعبئة</TableHead>
                                            <TableHead>الكمية</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {finishedPackaging.map(pkg => (
                                            <TableRow key={pkg.id}>
                                                <TableCell>{pkg.packaging_materials?.name}</TableCell>
                                                <TableCell>{pkg.quantity} {pkg.packaging_materials?.unit}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Used In (for Raw/Packaging) */}
            {(itemTypePath === 'raw-materials' || itemTypePath === 'packaging') && usedIn && usedIn.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowUpRight className="h-5 w-5" />
                            يدخل في إنتاج
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>المنتج</TableHead>
                                    <TableHead>الكود</TableHead>
                                    <TableHead>النوع</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {usedIn.map((product, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="font-medium">{product.product_name}</TableCell>
                                        <TableCell>{product.product_code}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {product.type === 'semi' ? 'نصف مصنع' : 'منتج نهائي'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => navigate(`/inventory/${product.type === 'semi' ? 'semi-finished' : 'finished'}/${product.id}`)}
                                            >
                                                عرض
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Movements History */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        سجل الحركات (آخر 30)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {movements && movements.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>قبل</TableHead>
                                        <TableHead>بعد</TableHead>
                                        <TableHead>السبب</TableHead>
                                        <TableHead>التاريخ</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {movements.map(mov => {
                                        const config = MOVEMENT_CONFIG[mov.movement_type as keyof typeof MOVEMENT_CONFIG] || MOVEMENT_CONFIG.adjustment;
                                        const Icon = config.icon;
                                        return (
                                            <TableRow key={mov.id}>
                                                <TableCell>
                                                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${config.color}`}>
                                                        <Icon className="h-3 w-3" />
                                                        <span className="text-xs">{config.label}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono font-bold">
                                                    {mov.movement_type === 'in' ? '+' : mov.movement_type === 'out' ? '-' : ''}{formatNumber(mov.quantity)}
                                                </TableCell>
                                                <TableCell className="font-mono text-muted-foreground">{formatNumber(mov.previous_balance)}</TableCell>
                                                <TableCell className="font-mono font-bold">{formatNumber(mov.new_balance)}</TableCell>
                                                <TableCell className="text-muted-foreground text-sm">{mov.reason}</TableCell>
                                                <TableCell className="text-muted-foreground text-sm">{format(new Date(mov.created_at), 'dd/MM HH:mm')}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-muted-foreground">
                            <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>لا توجد حركات مسجلة</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
