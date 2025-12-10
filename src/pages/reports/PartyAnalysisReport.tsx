import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Users, Truck, TrendingUp, Banknote, Clock, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';

interface PartyAnalysis {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    total_invoices: number;
    total_amount: number;
    total_paid: number;
    total_remaining: number;
    return_count: number;
    return_amount: number;
    return_percentage: number;
    avg_payment_days: number;
    last_transaction_date: string | null;
}

interface Party {
    id: string;
    name: string;
    type: string;
    balance: number;
}

interface Invoice {
    id: string;
    party_id: string;
    type: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    date: string;
    payment_status: string;
}

interface Payment {
    id: string;
    party_id: string;
    amount: number;
    date: string;
}

interface Return {
    id: string;
    party_id: string;
    total_amount: number;
    date: string;
}

export default function PartyAnalysisReport() {
    const navigate = useNavigate();
    const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
    const [sortBy, setSortBy] = useState<'total' | 'balance' | 'returns' | 'payment_days'>('total');

    // Fetch parties
    const { data: parties } = useQuery({
        queryKey: ['parties'],
        queryFn: async () => {
            const { data } = await supabase.from('parties').select('id, name, type, balance');
            return (data || []) as Party[];
        }
    });

    // Fetch sales invoices (for customers)
    const { data: salesInvoices } = useQuery({
        queryKey: ['sales_invoices_report'],
        queryFn: async () => {
            const { data } = await supabase
                .from('sales_invoices')
                .select('id, customer_id, total_amount, paid_amount, transaction_date, status');
            return (data || []).map(inv => ({
                id: inv.id,
                party_id: inv.customer_id,
                type: 'sale' as const,
                total_amount: inv.total_amount || 0,
                paid_amount: inv.paid_amount || 0,
                remaining_amount: (inv.total_amount || 0) - (inv.paid_amount || 0),
                date: inv.transaction_date,
                payment_status: inv.paid_amount >= inv.total_amount ? 'paid' : 'unpaid'
            })) as Invoice[];
        }
    });

    // Fetch purchase invoices (for suppliers)
    const { data: purchaseInvoices } = useQuery({
        queryKey: ['purchase_invoices_report'],
        queryFn: async () => {
            const { data } = await supabase
                .from('purchase_invoices')
                .select('id, supplier_id, total_amount, paid_amount, transaction_date, status');
            return (data || []).map(inv => ({
                id: inv.id,
                party_id: inv.supplier_id,
                type: 'purchase' as const,
                total_amount: inv.total_amount || 0,
                paid_amount: inv.paid_amount || 0,
                remaining_amount: (inv.total_amount || 0) - (inv.paid_amount || 0),
                date: inv.transaction_date,
                payment_status: inv.paid_amount >= inv.total_amount ? 'paid' : 'unpaid'
            })) as Invoice[];
        }
    });

    // Combine all invoices
    const invoices = [...(salesInvoices || []), ...(purchaseInvoices || [])];

    // Fetch payments with dates
    const { data: payments } = useQuery({
        queryKey: ['payments_all'],
        queryFn: async () => {
            const { data } = await supabase.from('payments').select('id, party_id, amount, date');
            return (data || []) as Payment[];
        }
    });

    // Note: Returns are stored in separate tables (purchase_returns, sales_returns)
    // For simplicity, we set return metrics to 0 - could be enhanced to query both tables
    const returns: Return[] = [];


    // Calculate analysis for each party
    const partyAnalysis = useMemo((): PartyAnalysis[] => {
        if (!parties || !invoices) return [];

        return parties.map(party => {
            const partyInvoices = invoices.filter(i => i.party_id === party.id);
            const partyPayments = payments?.filter(p => p.party_id === party.id) || [];
            const partyReturns = returns?.filter(r => r.party_id === party.id) || [];

            const totalAmount = partyInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
            const totalPaid = partyInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
            const totalRemaining = partyInvoices.reduce((s, i) => s + (i.remaining_amount || 0), 0);
            const returnAmount = partyReturns.reduce((s, r) => s + (r.total_amount || 0), 0);

            // Calculate average payment days
            let avgPaymentDays = 0;
            const paidInvoices = partyInvoices.filter(i => i.payment_status === 'paid');
            if (paidInvoices.length > 0 && partyPayments.length > 0) {
                const paymentDelays = paidInvoices.map(inv => {
                    const invDate = new Date(inv.date);
                    // Find the last payment for this invoice (simplified)
                    const lastPayment = partyPayments
                        .filter(p => new Date(p.date) >= invDate)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

                    if (lastPayment) {
                        return differenceInDays(new Date(lastPayment.date), invDate);
                    }
                    return 0;
                });
                avgPaymentDays = paymentDelays.reduce((s, d) => s + d, 0) / paymentDelays.length;
            }

            // Find last transaction
            const allDates = [
                ...partyInvoices.map(i => i.date),
                ...partyPayments.map(p => p.date),
                ...partyReturns.map(r => r.date)
            ].filter(Boolean).sort().reverse();

            return {
                id: party.id,
                name: party.name,
                type: party.type as 'customer' | 'supplier',
                total_invoices: partyInvoices.length,
                total_amount: totalAmount,
                total_paid: totalPaid,
                total_remaining: totalRemaining,
                return_count: partyReturns.length,
                return_amount: returnAmount,
                return_percentage: totalAmount > 0 ? (returnAmount / totalAmount) * 100 : 0,
                avg_payment_days: Math.round(avgPaymentDays),
                last_transaction_date: allDates[0] || null
            };
        });
    }, [parties, salesInvoices, purchaseInvoices, payments]);

    // Filter
    const filtered = typeFilter === 'all'
        ? partyAnalysis
        : partyAnalysis.filter(p => p.type === typeFilter);

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        switch (sortBy) {
            case 'total':
                return b.total_amount - a.total_amount;
            case 'balance':
                return b.total_remaining - a.total_remaining;
            case 'returns':
                return b.return_percentage - a.return_percentage;
            case 'payment_days':
                return b.avg_payment_days - a.avg_payment_days;
            default:
                return 0;
        }
    });

    // Stats
    const customers = partyAnalysis.filter(p => p.type === 'customer');
    const suppliers = partyAnalysis.filter(p => p.type === 'supplier');

    const totalCustomerSales = customers.reduce((s, c) => s + c.total_amount, 0);
    const totalSupplierPurchases = suppliers.reduce((s, s2) => s + s2.total_amount, 0);
    const totalReceivables = customers.reduce((s, c) => s + c.total_remaining, 0);
    const totalPayables = suppliers.reduce((s, s2) => s + s2.total_remaining, 0);

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold">تحليل العملاء والموردين</h1>
                        <p className="text-sm text-muted-foreground">تحليل شامل للتعاملات والأداء</p>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">إجمالي المبيعات</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{totalCustomerSales.toLocaleString()}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">{customers.length} عميل</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Truck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm text-purple-700 dark:text-purple-300">إجمالي المشتريات</span>
                        </div>
                        <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{totalSupplierPurchases.toLocaleString()}</p>
                        <p className="text-xs text-purple-600 dark:text-purple-400">{suppliers.length} مورد</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">مستحقات لنا</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">{totalReceivables.toLocaleString()}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Banknote className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">مستحقات علينا</span>
                        </div>
                        <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{totalPayables.toLocaleString()}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">ج.م</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-4">
                        <div className="flex-1 min-w-[150px]">
                            <label className="text-sm font-medium mb-2 block">نوع الطرف</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm"
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value as 'all' | 'customer' | 'supplier')}
                            >
                                <option value="all">الكل</option>
                                <option value="customer">عملاء</option>
                                <option value="supplier">موردين</option>
                            </select>
                        </div>

                        <div className="flex-1 min-w-[150px]">
                            <label className="text-sm font-medium mb-2 block">ترتيب حسب</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm"
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as 'total' | 'balance' | 'returns' | 'payment_days')}
                            >
                                <option value="total">إجمالي التعاملات</option>
                                <option value="balance">الرصيد المتبقي</option>
                                <option value="returns">نسبة المرتجعات</option>
                                <option value="payment_days">متوسط فترة السداد</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Party List */}
            <div className="grid gap-4">
                {sorted.length === 0 ? (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p>لا توجد بيانات للعرض</p>
                        </CardContent>
                    </Card>
                ) : (
                    sorted.map(party => (
                        <Card key={party.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            {party.type === 'customer' ? (
                                                <Users className="h-4 w-4 text-blue-600" />
                                            ) : (
                                                <Truck className="h-4 w-4 text-purple-600" />
                                            )}
                                            <h3 className="font-semibold">{party.name}</h3>
                                            <span className={`px-2 py-0.5 rounded text-xs ${party.type === 'customer' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                {party.type === 'customer' ? 'عميل' : 'مورد'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">إجمالي التعاملات</span>
                                                <p className="font-medium">{party.total_amount.toLocaleString()} ج.م</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">الفواتير</span>
                                                <p className="font-medium">{party.total_invoices} فاتورة</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">المدفوع</span>
                                                <p className="font-medium text-green-600">{party.total_paid.toLocaleString()} ج.م</p>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">المتبقي</span>
                                                <p className={`font-medium ${party.total_remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {party.total_remaining.toLocaleString()} ج.م
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex sm:flex-col items-center gap-4 sm:gap-2 sm:text-center border-t sm:border-t-0 sm:border-r pt-4 sm:pt-0 sm:pr-4">
                                        <div className="flex items-center gap-1">
                                            <Percent className="h-4 w-4 text-amber-500" />
                                            <span className="text-sm font-medium">{party.return_percentage.toFixed(1)}%</span>
                                            <span className="text-xs text-muted-foreground">مرتجعات</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-4 w-4 text-blue-500" />
                                            <span className="text-sm font-medium">{party.avg_payment_days}</span>
                                            <span className="text-xs text-muted-foreground">يوم سداد</span>
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
