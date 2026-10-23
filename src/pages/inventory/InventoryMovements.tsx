import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from 'react-router-dom';
import { readMovementPage } from '@/services/InventoryMovementsService';
import { movementScope, MOVEMENT_PAGE_SIZE } from '@/features/inventory/movement-page';
import { CatalogReadState } from '@/components/ui/catalog-read-state';
import { Button } from '@/components/ui/button';
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ArrowUpDown,
    ArrowDownLeft,
    ArrowUpRight,
    History,
    Search,
    Filter
} from "lucide-react";

import { formatInventoryQuantity as formatNumber } from "@/lib/inventory-format";
import { format } from "date-fns";



const ITEM_TYPE_LABELS: Record<string, string> = {
    raw_materials: 'مواد خام',
    packaging_materials: 'مواد تعبئة',
    semi_finished_products: 'نصف مصنع',
    finished_products: 'منتج تام',
    product_bundles: 'باندل'
};

const MOVEMENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
    in: { label: 'دخول', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: ArrowUpRight },
    out: { label: 'خروج', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: ArrowDownLeft },
    adjustment: { label: 'تسوية', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: ArrowUpDown }
};

export default function InventoryMovements() {
    const [params, setParams] = useSearchParams();
    const scope = movementScope(params);
    const { itemType: filterType, movementType: filterMovement } = scope;
    const [searchQuery, setSearchQuery] = useState('');
    function changeFilter(key: string, value: string) {
        const next = new URLSearchParams(params); next.set(key, value); next.delete('page');
        if (key === 'item_type') next.delete('item_id');
        setParams(next);
    }
    function changePage(page: number) { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }
    const ledger = useQuery({ queryKey: ['inventory-movements', scope.itemType, scope.itemId, scope.movementType, scope.page],
        queryFn: () => readMovementPage(scope), retry: false });
    const movements = ledger.data?.rows;

    const filteredMovements = movements?.filter(m => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return m.item_name?.toLowerCase().includes(q) ||
            m.reason?.toLowerCase().includes(q) ||
            m.reference_id?.toLowerCase().includes(q);
    });

    const stats = {
        totalIn: movements?.filter(m => m.movement_type === 'in').length || 0,
        totalOut: movements?.filter(m => m.movement_type === 'out').length || 0,
        totalAdj: movements?.filter(m => m.movement_type === 'adjustment').length || 0,
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="سجل حركات المخزون"
                description="تصفح حركات الدخول والخروج والتسويات، من الأحدث إلى الأقدم"
                icon={History}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">الأعداد والبحث تخص الصفحة الحالية، بحد أقصى100 حركة. تنقّل بين الصفحات للوصول إلى الحركات الأقدم.</p>
                <Button variant="outline" disabled={ledger.isFetching} onClick={() => void ledger.refetch()}>تحديث السجل</Button>
                {!!scope.itemId && <p className="text-sm">سجل {ITEM_TYPE_LABELS[scope.itemType]} للصنف #{scope.itemId} <Button variant="ghost" onClick={() => changeFilter('item_type', scope.itemType)}>عرض كل الأصناف من هذا النوع</Button></p>}
            </div>
            {/* Stats */}
            {movements && <>
            <div className="grid gap-3 grid-cols-3">
                <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-5 h-5 text-green-600" />
                            <div>
                                <p className="text-xs text-muted-foreground">دخول</p>
                                <p className="text-xl font-bold text-green-600">{stats.totalIn}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20 border-red-200">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-2">
                            <ArrowDownLeft className="w-5 h-5 text-red-600" />
                            <div>
                                <p className="text-xs text-muted-foreground">خروج</p>
                                <p className="text-xl font-bold text-red-600">{stats.totalOut}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                    <CardContent className="py-4">
                        <div className="flex items-center gap-2">
                            <ArrowUpDown className="w-5 h-5 text-blue-600" />
                            <div>
                                <p className="text-xs text-muted-foreground">تسوية</p>
                                <p className="text-xl font-bold text-blue-600">{stats.totalAdj}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            </>}
            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                aria-label="بحث في الصفحة الحالية" placeholder="بحث داخل الصفحة الحالية بالاسم أو السبب أو المرجع..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={filterType} onValueChange={(v) => changeFilter('item_type', v)}>
                                <SelectTrigger aria-label="نوع الصنف" className="w-[130px]">
                                    <Filter className="w-4 h-4 ml-2" />
                                    <SelectValue placeholder="النوع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="raw_materials">مواد خام</SelectItem>
                                    <SelectItem value="packaging_materials">مواد تعبئة</SelectItem>
                                    <SelectItem value="semi_finished_products">نصف مصنع</SelectItem>
                                    <SelectItem value="finished_products">منتج تام</SelectItem>
                                    <SelectItem value="product_bundles">باندلات</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterMovement} onValueChange={(v) => changeFilter('movement_type', v)}>
                                <SelectTrigger aria-label="نوع الحركة" className="w-[110px]">
                                    <SelectValue placeholder="الحركة" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="in">دخول</SelectItem>
                                    <SelectItem value="out">خروج</SelectItem>
                                    <SelectItem value="adjustment">تسوية</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Movements List */}
            <CatalogReadState query={{ ...ledger, data: movements }} entity="حركات المخزون" onRetry={() => void ledger.refetch()}>
            {filteredMovements?.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>{searchQuery ? 'لا توجد نتائج في هذه الصفحة. جرّب بحثًا آخر أو انتقل لصفحة أخرى.' : scope.page > 0 ? 'لا توجد حركات في هذه الصفحة. ارجع إلى الصفحة السابقة أو حدّث السجل.' : 'لا توجد حركات ضمن الفلاتر المحددة.'}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredMovements?.map((mov) => {
                        const config = MOVEMENT_TYPE_CONFIG[mov.movement_type] || MOVEMENT_TYPE_CONFIG.adjustment;
                        const Icon = config.icon;

                        return (
                            <Card key={mov.id} data-movement-id={mov.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div className={`p-2 rounded-lg ${config.color}`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium break-words">{mov.item_name}</h3>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <Badge variant="outline" className="text-xs">
                                                        {ITEM_TYPE_LABELS[mov.item_type]}
                                                    </Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {mov.reason}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm">
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">الكمية</p>
                                                <p className={`font-mono font-bold ${mov.movement_type === 'in' ? 'text-green-600' : mov.movement_type === 'out' ? 'text-red-600' : ''}`}>
                                                    {mov.movement_type === 'in' ? '+' : mov.movement_type === 'out' ? '-' : ''}{formatNumber(mov.quantity)}
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">قبل</p>
                                                <p className="font-mono">{formatNumber(mov.previous_balance)}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">بعد</p>
                                                <p className="font-mono font-bold">{formatNumber(mov.new_balance)}</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs text-muted-foreground">
                                                    {format(new Date(mov.created_at), 'dd/MM HH:mm')}
                                                </p>
                                                {mov.reference_id && (
                                                    <p className="text-xs font-mono text-blue-600 break-all">
                                                        {mov.reference_id}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
            </CatalogReadState>
            <nav aria-label="صفحات حركات المخزون" className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" disabled={scope.page === 0 || ledger.isFetching} onClick={() => changePage(scope.page - 1)}>الأحدث</Button>
                <p role="status" className="text-sm">الصفحة {scope.page + 1}{ledger.data ? ' · '+formatNumber(ledger.data.count)+' حركة ضمن الفلاتر · '+formatNumber(filteredMovements?.length ?? 0)+' نتيجة في الصفحة' : ''}</p>
                <Button variant="outline" disabled={!ledger.data || (scope.page + 1) * MOVEMENT_PAGE_SIZE >= ledger.data.count || ledger.isFetching} onClick={() => changePage(scope.page + 1)}>الأقدم</Button>
            </nav>
        </div>
    );
}
