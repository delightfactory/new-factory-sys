import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Receipt,
    Calendar,
    Wallet,
    FileText,
    Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

interface Expense {
    id: number;
    amount: number;
    category: string;
    description: string;
    transaction_date: string;
    treasury_id: number;
    created_at: string;
    treasury?: { name: string };
}

export default function ExpenseDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch expense details
    const { data: expense, isLoading } = useQuery({
        queryKey: ['expense', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*, treasury:treasuries(name)')
                .eq('id', id)
                .eq('transaction_type', 'expense')
                .single();
            if (error) throw error;
            return data as Expense;
        },
        enabled: !!id
    });

    const getCategoryLabel = (category: string) => {
        const labels: Record<string, string> = {
            'utilities': 'مرافق',
            'rent': 'إيجار',
            'salaries': 'رواتب',
            'maintenance': 'صيانة',
            'transportation': 'نقل ومواصلات',
            'supplies': 'مستلزمات',
            'marketing': 'تسويق',
            'other': 'أخرى'
        };
        return labels[category] || category;
    };

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={2} />
            </div>
        );
    }

    if (!expense) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">المصروف غير موجود</p>
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
                        <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                            <Receipt className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">تفاصيل المصروف</h1>
                            <Badge variant="secondary">{getCategoryLabel(expense.category)}</Badge>
                        </div>
                    </div>
                </div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {expense.amount.toLocaleString('ar-EG')} ج.م
                    <span className="block text-xs font-normal text-muted-foreground">المبلغ</span>
                </div>
            </div>

            {/* Expense Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">معلومات المصروف</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">التاريخ</span>
                                <span className="font-medium">{format(new Date(expense.transaction_date), 'dd/MM/yyyy')}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Tag className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">البند</span>
                                <span className="font-medium">{getCategoryLabel(expense.category)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                            <Wallet className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <span className="text-xs text-muted-foreground block">الخزينة</span>
                                <span className="font-medium">{expense.treasury?.name || '-'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                            <Receipt className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <div>
                                <span className="text-xs text-muted-foreground block">المبلغ</span>
                                <span className="font-bold text-red-600 dark:text-red-400">{expense.amount.toLocaleString()} ج.م</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Description */}
            {expense.description && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            الوصف
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed">{expense.description}</p>
                    </CardContent>
                </Card>
            )}

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ التسجيل: {format(new Date(expense.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
