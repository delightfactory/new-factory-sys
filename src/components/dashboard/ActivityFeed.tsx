import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ActivityLog } from "@/services/DashboardService";
import { formatDistanceToNow } from "date-fns";
import { arEG } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Edit, Trash, Plus, Activity } from "lucide-react";

interface ActivityFeedProps {
    activities: ActivityLog[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
    const getIcon = (action: string) => {
        switch (action) {
            case 'INSERT': return <Plus className="h-4 w-4 text-emerald-500" />;
            case 'UPDATE': return <Edit className="h-4 w-4 text-blue-500" />;
            case 'DELETE': return <Trash className="h-4 w-4 text-red-500" />;
            default: return <Activity className="h-4 w-4 text-gray-500" />;
        }
    };

    const formatAction = (action: string, table: string) => {
        const actionMap: Record<string, string> = { 'INSERT': 'إضافة', 'UPDATE': 'تعديل', 'DELETE': 'حذف' };
        const tableMap: Record<string, string> = {
            'profiles': 'مستخدم',
            'raw_materials': 'مادة خام',
            'packaging_materials': 'مادة تعبئة',
            'finished_products': 'منتج تام',
            'production_orders': 'أمر إنتاج',
            'invoices': 'فاتورة',
            'financial_transactions': 'حركة مالية'
        };
        return `${actionMap[action] || action} في ${tableMap[table] || table}`;
    };

    return (
        <Card className="col-span-1 md:col-span-2 lg:col-span-1 h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-600" />
                    أحدث النشاطات
                </CardTitle>
                <CardDescription>سجل فوري لحركات النظام</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[350px] p-4 pt-0">
                    <div className="space-y-4">
                        {activities.length === 0 ? (
                            <p className="text-center text-sm text-muted-foreground py-8">لا يوجد نشاطات حديثة</p>
                        ) : (
                            activities.map((log) => (
                                <div key={log.id} className="flex items-start gap-3 border-b pb-3 last:border-0">
                                    <div className="mt-1 bg-muted p-2 rounded-full">
                                        {getIcon(log.action)}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">
                                            {formatAction(log.action, log.table_name)}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {log.user_name || 'مجهول'}
                                            </span>
                                            <span>•</span>
                                            <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: arEG })}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
