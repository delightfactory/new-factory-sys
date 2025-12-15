import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatNumber } from "@/lib/utils";
import { format } from "date-fns";

type ItemType = 'raw_materials' | 'packaging_materials' | 'semi_finished_products' | 'finished_products' | 'all';
type MovementType = 'in' | 'out' | 'adjustment' | 'all';

const ITEM_TYPE_LABELS: Record<string, string> = {
    raw_materials: 'مواد خام',
    packaging_materials: 'مواد تعبئة',
    semi_finished_products: 'نصف مصنع',
    finished_products: 'منتج تام'
};

const MOVEMENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowUpRight }> = {
    in: { label: 'دخول', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: ArrowUpRight },
    out: { label: 'خروج', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: ArrowDownLeft },
    adjustment: { label: 'تسوية', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: ArrowUpDown }
};

interface InventoryMovement {
    id: number;
    item_id: number;
    item_type: string;
    movement_type: string;
    quantity: number;
    previous_balance: number;
    new_balance: number;
    reason: string;
    reference_id: string | null;
    created_at: string;
    item_name?: string;
}

export default function InventoryMovements() {
    const [filterType, setFilterType] = useState<ItemType>('all');
    const [filterMovement, setFilterMovement] = useState<MovementType>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: movements, isLoading } = useQuery({
        queryKey: ['inventory-movements', filterType, filterMovement],
        queryFn: async () => {
            let query = supabase
                .from('inventory_movements')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (filterType !== 'all') {
                query = query.eq('item_type', filterType);
            }
            if (filterMovement !== 'all') {
                query = query.eq('movement_type', filterMovement);
            }

            const { data, error } = await query;
            if (error) throw error;

            // optimized: Batch fetch item names
            const itemIdsByType: Record<string, Set<number>> = {};
            (data || []).forEach((mov: InventoryMovement) => {
                if (!itemIdsByType[mov.item_type]) {
                    itemIdsByType[mov.item_type] = new Set();
                }
                itemIdsByType[mov.item_type].add(mov.item_id);
            });

            const itemNames: Record<string, Record<number, string>> = {};

            await Promise.all(Object.entries(itemIdsByType).map(async ([type, ids]) => {
                const { data: items } = await supabase
                    .from(type)
                    .select('id, name')
                    .in('id', Array.from(ids));

                if (items) {
                    itemNames[type] = {};
                    items.forEach((item: any) => {
                        itemNames[type][item.id] = item.name;
                    });
                }
            }));

            // Enrich with map
            const enriched = (data || []).map((mov) => {
                const name = itemNames[mov.item_type]?.[mov.item_id] || `#${mov.item_id}`;
                return {
                    ...mov,
                    item_name: name
                };
            });

            return enriched as InventoryMovement[];
        }
    });

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
                description="تتبع جميع حركات الدخول والخروج والتسويات"
                icon={History}
            />

            {/* Stats */}
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

            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث بالاسم أو السبب أو المرجع..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={filterType} onValueChange={(v) => setFilterType(v as ItemType)}>
                                <SelectTrigger className="w-[130px]">
                                    <Filter className="w-4 h-4 ml-2" />
                                    <SelectValue placeholder="النوع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">الكل</SelectItem>
                                    <SelectItem value="raw_materials">مواد خام</SelectItem>
                                    <SelectItem value="packaging_materials">مواد تعبئة</SelectItem>
                                    <SelectItem value="semi_finished_products">نصف مصنع</SelectItem>
                                    <SelectItem value="finished_products">منتج تام</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterMovement} onValueChange={(v) => setFilterMovement(v as MovementType)}>
                                <SelectTrigger className="w-[110px]">
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
            {isLoading ? (
                <CardGridSkeleton count={3} />
            ) : filteredMovements?.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>لا توجد حركات مسجلة</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredMovements?.map((mov) => {
                        const config = MOVEMENT_TYPE_CONFIG[mov.movement_type] || MOVEMENT_TYPE_CONFIG.adjustment;
                        const Icon = config.icon;

                        return (
                            <Card key={mov.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2 rounded-lg ${config.color}`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium">{mov.item_name}</h3>
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
                                        <div className="flex items-center gap-4 text-sm">
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">الكمية</p>
                                                <p className={`font-mono font-bold ${mov.movement_type === 'in' ? 'text-green-600' : mov.movement_type === 'out' ? 'text-red-600' : ''}`}>
                                                    {mov.movement_type === 'in' ? '+' : mov.movement_type === 'out' ? '-' : ''}{formatNumber(mov.quantity)}
                                                </p>
                                            </div>
                                            <div className="text-center hidden sm:block">
                                                <p className="text-xs text-muted-foreground">قبل</p>
                                                <p className="font-mono">{formatNumber(mov.previous_balance)}</p>
                                            </div>
                                            <div className="text-center hidden sm:block">
                                                <p className="text-xs text-muted-foreground">بعد</p>
                                                <p className="font-mono font-bold">{formatNumber(mov.new_balance)}</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-xs text-muted-foreground">
                                                    {format(new Date(mov.created_at), 'dd/MM HH:mm')}
                                                </p>
                                                {mov.reference_id && (
                                                    <p className="text-xs font-mono text-blue-600">
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
        </div>
    );
}
