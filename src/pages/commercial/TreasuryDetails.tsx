import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    Wallet,
    Calendar,
    TrendingUp,
    TrendingDown,
    Banknote,
    ArrowUpCircle,
    ArrowDownCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

interface Treasury {
    id: number;
    name: string;
    balance: number;
    created_at: string;
}

interface Transaction {
    id: number;
    amount: number;
    transaction_type: 'income' | 'expense';
    category: string;
    description: string;
    transaction_date: string;
}

export default function TreasuryDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch treasury details
    const { data: treasury, isLoading: treasuryLoading } = useQuery({
        queryKey: ['treasury', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('treasuries')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as Treasury;
        },
        enabled: !!id
    });

    // Fetch recent transactions
    const { data: transactions } = useQuery({
        queryKey: ['treasury-transactions', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('treasury_id', id)
                .order('transaction_date', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data as Transaction[];
        },
        enabled: !!id
    });

    // Calculate stats
    const totalIncome = transactions?.filter(t => t.transaction_type === 'income').reduce((s, t) => s + (t.amount || 0), 0) || 0;
    const totalExpense = transactions?.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0) || 0;

    if (treasuryLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={3} />
            </div>
        );
    }

    if (!treasury) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الخزينة غير موجودة</p>
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
                        <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                            <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">{treasury.name}</h1>
                            <span className="text-sm text-muted-foreground">خزينة</span>
                        </div>
                    </div>
                </div>
                <div className={`text-2xl font-bold ${treasury.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {treasury.balance.toLocaleString('ar-EG')} ج.م
                    <span className="block text-xs font-normal text-muted-foreground">الرصيد الحالي</span>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-sm text-emerald-700 dark:text-emerald-300">الرصيد</span>
                        </div>
                        <p className="text-xl font-bold text-emerald-900 dark:text-emerald-100">{treasury.balance.toLocaleString()}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">إجمالي الإيرادات</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">{totalIncome.toLocaleString()}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm text-red-700 dark:text-red-300">إجمالي المصروفات</span>
                        </div>
                        <p className="text-xl font-bold text-red-900 dark:text-red-100">{totalExpense.toLocaleString()}</p>
                        <p className="text-xs text-red-600 dark:text-red-400">ج.م</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Transactions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">آخر المعاملات</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {transactions && transactions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>التاريخ</TableHead>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>البند</TableHead>
                                        <TableHead>الوصف</TableHead>
                                        <TableHead>المبلغ</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map(trx => (
                                        <TableRow key={trx.id}>
                                            <TableCell>{format(new Date(trx.transaction_date), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>
                                                {trx.transaction_type === 'income' ? (
                                                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                                        <ArrowDownCircle className="h-4 w-4" />
                                                        <span>إيراد</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                                        <ArrowUpCircle className="h-4 w-4" />
                                                        <span>مصروف</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{trx.category}</Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate">{trx.description || '-'}</TableCell>
                                            <TableCell className={`font-bold ${trx.transaction_type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {trx.transaction_type === 'income' ? '+' : '-'}{trx.amount.toLocaleString()} ج.م
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-muted-foreground">
                            <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>لا توجد معاملات</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ الإنشاء: {format(new Date(treasury.created_at), 'dd/MM/yyyy')}</span>
            </div>
        </div>
    );
}
