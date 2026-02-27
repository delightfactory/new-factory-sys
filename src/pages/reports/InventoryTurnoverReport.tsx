import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, RotateCw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface TurnoverItem {
    id: string;
    name: string;
    code: string;
    type: 'raw' | 'packaging' | 'semi_finished' | 'finished';
    current_quantity: number;
    unit_cost: number;
    total_consumed: number;
    turnover_ratio: number;
    days_on_hand: number;
}

const TYPE_LABELS: Record<string, string> = {
    raw: 'مواد خام',
    packaging: 'مواد تعبئة',
    semi_finished: 'نصف مصنع',
    finished: 'منتج نهائي'
};

const TYPE_COLORS: Record<string, string> = {
    raw: 'bg-amber-100 text-amber-800',
    packaging: 'bg-blue-100 text-blue-800',
    semi_finished: 'bg-purple-100 text-purple-800',
    finished: 'bg-green-100 text-green-800'
};

export default function InventoryTurnoverReport() {
    const navigate = useNavigate();
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'turnover' | 'days' | 'value'>('turnover');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Fetch all inventory items
    const { data: rawMaterials } = useQuery({
        queryKey: ['raw_materials'],
        queryFn: async () => {
            const { data } = await supabase.from('raw_materials').select('id, name, code, quantity, unit_cost');
            return data || [];
        }
    });

    const { data: packagingMaterials } = useQuery({
        queryKey: ['packaging_materials'],
        queryFn: async () => {
            const { data } = await supabase.from('packaging_materials').select('id, name, code, quantity, unit_cost');
            return data || [];
        }
    });

    const { data: semiFinished } = useQuery({
        queryKey: ['semi_finished_products'],
        queryFn: async () => {
            const { data } = await supabase.from('semi_finished_products').select('id, name, code, quantity, unit_cost');
            return data || [];
        }
    });

    const { data: finished } = useQuery({
        queryKey: ['finished_products'],
        queryFn: async () => {
            const { data } = await supabase.from('finished_products').select('id, name, code, quantity, unit_cost');
            return data || [];
        }
    });

    // Fetch movement data (last 90 days)
    const { data: movements } = useQuery({
        queryKey: ['inventory_movements_90d'],
        queryFn: async () => {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            const { data } = await supabase
                .from('inventory_movements')
                .select('item_id, item_type, movement_type, quantity')
                .eq('movement_type', 'out')
                .gte('created_at', ninetyDaysAgo.toISOString());
            return data || [];
        }
    });

    // Calculate turnover for each item
    const calculateTurnover = (): TurnoverItem[] => {
        const items: TurnoverItem[] = [];
        const movementMap = new Map<string, number>();

        // Build consumption map from movements
        movements?.forEach((m: { item_id: string; item_type: string; quantity: number }) => {
            const key = `${m.item_type}_${m.item_id}`;
            movementMap.set(key, (movementMap.get(key) || 0) + m.quantity);
        });

        // Process raw materials
        rawMaterials?.forEach((item: { id: string; name: string; code: string; quantity: number; unit_cost: number }) => {
            const consumed = movementMap.get(`raw_materials_${item.id}`) || 0;
            const avgInventory = item.quantity + consumed / 2; // Simple average
            const turnover = avgInventory > 0 ? (consumed / avgInventory) * 4 : 0; // Annualized (90 days * 4)
            const daysOnHand = consumed > 0 ? (item.quantity / (consumed / 90)) : 999;

            items.push({
                id: item.id,
                name: item.name,
                code: item.code,
                type: 'raw',
                current_quantity: item.quantity,
                unit_cost: item.unit_cost,
                total_consumed: consumed,
                turnover_ratio: Math.round(turnover * 100) / 100,
                days_on_hand: Math.round(daysOnHand)
            });
        });

        // Process packaging materials
        packagingMaterials?.forEach((item: { id: string; name: string; code: string; quantity: number; unit_cost: number }) => {
            const consumed = movementMap.get(`packaging_materials_${item.id}`) || 0;
            const avgInventory = item.quantity + consumed / 2;
            const turnover = avgInventory > 0 ? (consumed / avgInventory) * 4 : 0;
            const daysOnHand = consumed > 0 ? (item.quantity / (consumed / 90)) : 999;

            items.push({
                id: item.id,
                name: item.name,
                code: item.code,
                type: 'packaging',
                current_quantity: item.quantity,
                unit_cost: item.unit_cost,
                total_consumed: consumed,
                turnover_ratio: Math.round(turnover * 100) / 100,
                days_on_hand: Math.round(daysOnHand)
            });
        });

        // Process semi-finished
        semiFinished?.forEach((item: { id: string; name: string; code: string; quantity: number; unit_cost: number }) => {
            const consumed = movementMap.get(`semi_finished_products_${item.id}`) || 0;
            const avgInventory = item.quantity + consumed / 2;
            const turnover = avgInventory > 0 ? (consumed / avgInventory) * 4 : 0;
            const daysOnHand = consumed > 0 ? (item.quantity / (consumed / 90)) : 999;

            items.push({
                id: item.id,
                name: item.name,
                code: item.code,
                type: 'semi_finished',
                current_quantity: item.quantity,
                unit_cost: item.unit_cost,
                total_consumed: consumed,
                turnover_ratio: Math.round(turnover * 100) / 100,
                days_on_hand: Math.round(daysOnHand)
            });
        });

        // Process finished products
        finished?.forEach((item: { id: string; name: string; code: string; quantity: number; unit_cost: number }) => {
            const consumed = movementMap.get(`finished_products_${item.id}`) || 0;
            const avgInventory = item.quantity + consumed / 2;
            const turnover = avgInventory > 0 ? (consumed / avgInventory) * 4 : 0;
            const daysOnHand = consumed > 0 ? (item.quantity / (consumed / 90)) : 999;

            items.push({
                id: item.id,
                name: item.name,
                code: item.code,
                type: 'finished',
                current_quantity: item.quantity,
                unit_cost: item.unit_cost,
                total_consumed: consumed,
                turnover_ratio: Math.round(turnover * 100) / 100,
                days_on_hand: Math.round(daysOnHand)
            });
        });

        return items;
    };

    const allItems = calculateTurnover();

    // Filter
    const filteredItems = typeFilter === 'all'
        ? allItems
        : allItems.filter(i => i.type === typeFilter);

    // Sort
    const sortedItems = [...filteredItems].sort((a, b) => {
        let diff = 0;
        switch (sortBy) {
            case 'turnover':
                diff = a.turnover_ratio - b.turnover_ratio;
                break;
            case 'days':
                diff = a.days_on_hand - b.days_on_hand;
                break;
            case 'value':
                diff = (a.current_quantity * a.unit_cost) - (b.current_quantity * b.unit_cost);
                break;
        }
        return sortDir === 'desc' ? -diff : diff;
    });

    // Stats
    const avgTurnover = allItems.length > 0
        ? allItems.reduce((s, i) => s + i.turnover_ratio, 0) / allItems.length
        : 0;

    const slowMoving = allItems.filter(i => i.turnover_ratio < 2 && i.total_consumed > 0).length;
    const fastMoving = allItems.filter(i => i.turnover_ratio >= 6).length;
    const deadStock = allItems.filter(i => i.total_consumed === 0 && i.current_quantity > 0).length;

    const getTurnoverBadge = (ratio: number, consumed: number) => {
        if (consumed === 0) return 'bg-gray-100 text-gray-800';
        if (ratio >= 6) return 'bg-green-100 text-green-800';
        if (ratio >= 3) return 'bg-blue-100 text-blue-800';
        if (ratio >= 1) return 'bg-amber-100 text-amber-800';
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold">تقرير دوران المخزون</h1>
                        <p className="text-sm text-muted-foreground">تحليل سرعة حركة الأصناف (آخر 90 يوم)</p>
                    </div>
                </div>
            </div>

            {/* Warning if no movement data */}
            {allItems.length > 0 && allItems.every(i => i.total_consumed === 0) && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <Package className="h-4 w-4 shrink-0" />
                    <span>لا توجد بيانات حركة مخزون — معدلات الدوران قد لا تكون دقيقة. تأكد من تسجيل حركات المخزون.</span>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <RotateCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">متوسط الدوران</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{avgTurnover.toFixed(1)}x</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">سنوياً</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">سريع الدوران</span>
                        </div>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100">{fastMoving}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">≥6x سنوياً</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">بطيء الدوران</span>
                        </div>
                        <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{slowMoving}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">&lt;2x سنوياً</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm text-red-700 dark:text-red-300">مخزون راكد</span>
                        </div>
                        <p className="text-2xl font-bold text-red-900 dark:text-red-100">{deadStock}</p>
                        <p className="text-xs text-red-600 dark:text-red-400">بدون حركة</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[150px]">
                            <label className="text-sm font-medium mb-2 block">نوع الصنف</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm"
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                            >
                                <option value="all">جميع الأنواع</option>
                                <option value="raw">مواد خام</option>
                                <option value="packaging">مواد تعبئة</option>
                                <option value="semi_finished">نصف مصنع</option>
                                <option value="finished">منتج نهائي</option>
                            </select>
                        </div>

                        <div className="flex-1 min-w-[150px]">
                            <label className="text-sm font-medium mb-2 block">ترتيب حسب</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm"
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as 'turnover' | 'days' | 'value')}
                            >
                                <option value="turnover">معدل الدوران</option>
                                <option value="days">أيام التغطية</option>
                                <option value="value">قيمة المخزون</option>
                            </select>
                        </div>

                        <div className="flex-1 min-w-[100px]">
                            <label className="text-sm font-medium mb-2 block">الاتجاه</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm"
                                value={sortDir}
                                onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}
                            >
                                <option value="desc">تنازلي</option>
                                <option value="asc">تصاعدي</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Items List */}
            <div className="grid gap-4">
                {sortedItems.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>لا توجد بيانات للعرض</p>
                        </CardContent>
                    </Card>
                ) : (
                    sortedItems.map(item => (
                        <Card key={`${item.type}_${item.id}`} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <h3 className="font-semibold">{item.name}</h3>
                                            <span className="text-xs text-muted-foreground">({item.code})</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${TYPE_COLORS[item.type]}`}>
                                                {TYPE_LABELS[item.type]}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                            <span>الكمية: {item.current_quantity.toLocaleString()}</span>
                                            <span>المستهلك (90 يوم): {item.total_consumed.toLocaleString()}</span>
                                            <span>القيمة: {(item.current_quantity * item.unit_cost).toLocaleString()} ج.م</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-center">
                                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTurnoverBadge(item.turnover_ratio, item.total_consumed)}`}>
                                                {item.total_consumed === 0 ? 'راكد' : `${item.turnover_ratio}x`}
                                            </span>
                                            <p className="text-xs text-muted-foreground mt-1">الدوران السنوي</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold">{item.days_on_hand > 365 ? '365+' : item.days_on_hand}</p>
                                            <p className="text-xs text-muted-foreground">يوم تغطية</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
