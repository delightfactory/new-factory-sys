import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Clock,
    AlertTriangle,
    TrendingUp,
    Users,
    Download
} from "lucide-react";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { differenceInDays, format } from "date-fns";
import { PrintButton } from "@/components/print/PrintLayout";

type PartyType = 'customer' | 'supplier' | 'all';
type SortBy = 'amount' | 'days' | 'name';

interface AgingBucket {
    label: string;
    days: string;
    amount: number;
    count: number;
    color: string;
}

interface InvoiceAging {
    id: string;
    code: string;
    party_name: string;
    party_type: string;
    date: string;
    total_amount: number;
    remaining_amount: number;
    days_overdue: number;
    bucket: string;
}

export default function AgingReport() {
    const [filterType, setFilterType] = useState<PartyType>('all');
    const [sortBy, setSortBy] = useState<SortBy>('days');

    const { data, isLoading } = useQuery({
        queryKey: ['aging-report', filterType],
        queryFn: async () => {
            // Fetch unpaid/partial sales invoices (for customers)
            const { data: salesData } = await supabase
                .from('sales_invoices')
                .select('id, invoice_number, customer_id, total_amount, paid_amount, transaction_date, status, customer:parties!customer_id(name, type)')
                .in('status', ['draft', 'posted'])
                .order('transaction_date', { ascending: true });

            // Fetch unpaid/partial purchase invoices (for suppliers)
            const { data: purchaseData } = await supabase
                .from('purchase_invoices')
                .select('id, invoice_number, supplier_id, total_amount, paid_amount, transaction_date, status, supplier:parties!supplier_id(name, type)')
                .in('status', ['draft', 'posted'])
                .order('transaction_date', { ascending: true });

            // Combine and normalize invoices
            const salesInvoices = (salesData || []).map(inv => ({
                id: inv.id,
                code: inv.invoice_number || `S-${inv.id}`,
                party_id: inv.customer_id,
                parties: inv.customer,
                total_amount: inv.total_amount || 0,
                remaining_amount: (inv.total_amount || 0) - (inv.paid_amount || 0),
                date: inv.transaction_date,
                invoice_type: 'sale'
            }));

            const purchaseInvoices = (purchaseData || []).map(inv => ({
                id: inv.id,
                code: inv.invoice_number || `P-${inv.id}`,
                party_id: inv.supplier_id,
                parties: inv.supplier,
                total_amount: inv.total_amount || 0,
                remaining_amount: (inv.total_amount || 0) - (inv.paid_amount || 0),
                date: inv.transaction_date,
                invoice_type: 'purchase'
            }));

            const invoices = [...salesInvoices, ...purchaseInvoices]
                .filter(inv => inv.remaining_amount > 0); // Only unpaid/partial

            const today = new Date();

            // Process invoices with aging
            const processed: InvoiceAging[] = (invoices || [])
                .filter(inv => {
                    if (filterType === 'all') return true;
                    const party = inv.parties as { name?: string; type?: string } | null;
                    return party?.type === filterType;
                })
                .map(inv => {
                    const invoiceDate = new Date(inv.date);
                    const daysOverdue = differenceInDays(today, invoiceDate);
                    const party = inv.parties as { name?: string; type?: string } | null;

                    let bucket = '0-30';
                    if (daysOverdue > 90) bucket = '90+';
                    else if (daysOverdue > 60) bucket = '61-90';
                    else if (daysOverdue > 30) bucket = '31-60';

                    return {
                        id: String(inv.id),
                        code: inv.code,
                        party_name: party?.name || 'غير محدد',
                        party_type: party?.type || 'customer',
                        date: inv.date,
                        total_amount: inv.total_amount,
                        remaining_amount: inv.remaining_amount,
                        days_overdue: daysOverdue,
                        bucket
                    };
                });

            // Calculate buckets
            const buckets: AgingBucket[] = [
                { label: '0-30 يوم', days: '0-30', amount: 0, count: 0, color: 'bg-green-100 text-green-800 dark:bg-green-900/30' },
                { label: '31-60 يوم', days: '31-60', amount: 0, count: 0, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30' },
                { label: '61-90 يوم', days: '61-90', amount: 0, count: 0, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30' },
                { label: '+90 يوم', days: '90+', amount: 0, count: 0, color: 'bg-red-100 text-red-800 dark:bg-red-900/30' }
            ];

            processed.forEach(inv => {
                const bucket = buckets.find(b => b.days === inv.bucket);
                if (bucket) {
                    bucket.amount += inv.remaining_amount;
                    bucket.count++;
                }
            });

            // Sort invoices
            const sorted = [...processed].sort((a, b) => {
                if (sortBy === 'days') return b.days_overdue - a.days_overdue;
                if (sortBy === 'amount') return b.remaining_amount - a.remaining_amount;
                return a.party_name.localeCompare(b.party_name, 'ar');
            });

            const totalOverdue = processed.reduce((sum, inv) => sum + inv.remaining_amount, 0);

            return { invoices: sorted, buckets, totalOverdue };
        }
    });



    const currencyFormat = (value: number) =>
        new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(value) + ' ج.م';

    if (isLoading) return <CardGridSkeleton count={4} />;

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
                <PageHeader
                    title="تقرير أعمار الديون"
                    description="تحليل الفواتير المستحقة حسب فترة التأخير"
                    icon={Clock}
                />
                <div className="flex gap-2">
                    <PrintButton />
                    <Button size="sm">
                        <Download className="w-4 h-4 ml-2" />
                        تصدير
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                <Card className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            إجمالي المستحق
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {currencyFormat(data?.totalOverdue || 0)}
                        </div>
                    </CardContent>
                </Card>

                {data?.buckets.map((bucket) => (
                    <Card key={bucket.days} className={bucket.color.replace('text-', 'border-').split(' ')[0]}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-medium">{bucket.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold">{currencyFormat(bucket.amount)}</div>
                            <p className="text-xs text-muted-foreground">{bucket.count} فاتورة</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filters */}
            <Card className="print:hidden">
                <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-3 items-center">
                        <Select value={filterType} onValueChange={(v) => setFilterType(v as PartyType)}>
                            <SelectTrigger className="w-[140px]">
                                <Users className="w-4 h-4 ml-2" />
                                <SelectValue placeholder="النوع" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">الكل</SelectItem>
                                <SelectItem value="customer">عملاء</SelectItem>
                                <SelectItem value="supplier">موردين</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                            <SelectTrigger className="w-[140px]">
                                <TrendingUp className="w-4 h-4 ml-2" />
                                <SelectValue placeholder="ترتيب" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="days">الأقدم أولاً</SelectItem>
                                <SelectItem value="amount">الأعلى قيمة</SelectItem>
                                <SelectItem value="name">اسم الطرف</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Invoices List */}
            {data?.invoices.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>لا توجد فواتير مستحقة 🎉</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {data?.invoices.map((inv) => {
                        const isUrgent = inv.days_overdue > 60;
                        const bucketColor = inv.bucket === '90+' ? 'bg-red-100 text-red-800' :
                            inv.bucket === '61-90' ? 'bg-orange-100 text-orange-800' :
                                inv.bucket === '31-60' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-green-100 text-green-800';

                        return (
                            <Card key={inv.id} className={`hover:shadow-md transition-shadow ${isUrgent ? 'border-red-200' : ''}`}>
                                <CardContent className="p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            {isUrgent && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
                                            <div>
                                                <h3 className="font-medium">{inv.party_name}</h3>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <Badge variant="outline" className="text-xs">
                                                        {inv.party_type === 'customer' ? 'عميل' : 'مورد'}
                                                    </Badge>
                                                    <span className="text-xs font-mono text-muted-foreground">
                                                        {inv.code}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm">
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground">المستحق</p>
                                                <p className="font-mono font-bold text-red-600">
                                                    {currencyFormat(inv.remaining_amount)}
                                                </p>
                                            </div>
                                            <div className="text-center hidden sm:block">
                                                <p className="text-xs text-muted-foreground">التاريخ</p>
                                                <p className="font-mono text-sm">
                                                    {format(new Date(inv.date), 'dd/MM/yyyy')}
                                                </p>
                                            </div>
                                            <div className="text-center">
                                                <Badge className={bucketColor}>
                                                    {inv.days_overdue} يوم
                                                </Badge>
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
