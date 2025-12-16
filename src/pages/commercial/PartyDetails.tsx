import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    ArrowLeft,
    User,
    Phone,
    MapPin,
    Mail,
    FileText,
    Banknote,
    TrendingUp,
    TrendingDown,
    Calendar,
    Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import StatementPrintTemplate from '@/components/print/templates/StatementPrintTemplate';
import type { StatementData } from '@/components/print/templates/StatementPrintTemplate';

interface Party {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    phone: string | null;
    address: string | null;
    email: string | null;
    balance: number;
    created_at: string;
}

interface Invoice {
    id: number;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    transaction_date: string;
    status: string;
}

interface Payment {
    id: string;
    transaction_date: string;
    description: string;
    debit: number;
    credit: number;
    reference_type: string;
}

export default function PartyDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Fetch party details
    const { data: party, isLoading: partyLoading } = useQuery({
        queryKey: ['party', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('parties')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as Party;
        },
        enabled: !!id
    });

    // Fetch invoices based on party type
    const { data: invoices } = useQuery({
        queryKey: ['party-invoices', id, party?.type],
        queryFn: async () => {
            if (!party) return [];

            if (party.type === 'customer') {
                const { data } = await supabase
                    .from('sales_invoices')
                    .select('id, invoice_number, total_amount, paid_amount, transaction_date, status')
                    .eq('customer_id', id)
                    .order('transaction_date', { ascending: false })
                    .limit(20);
                return data as Invoice[] || [];
            } else {
                const { data } = await supabase
                    .from('purchase_invoices')
                    .select('id, invoice_number, total_amount, paid_amount, transaction_date, status')
                    .eq('supplier_id', id)
                    .order('transaction_date', { ascending: false })
                    .limit(20);
                return data as Invoice[] || [];
            }
        },
        enabled: !!party
    });

    // Fetch financial transactions (payments)
    const { data: payments } = useQuery({
        queryKey: ['party-transactions', id],
        queryFn: async () => {
            // Fetch from financial_transactions where party_id matches
            const { data } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('party_id', id)
                .order('transaction_date', { ascending: false })
                .limit(50);

            // Map to Payment interface expected by the UI
            return (data || []).map((t: any) => ({
                id: t.id,
                transaction_date: t.transaction_date,
                description: t.description,
                reference_type: t.reference_type || (t.transaction_type === 'income' ? 'payment' : 'bill'),
                // For Customer: Income (Payment from them) is Credit. Expense (Refund to them) is Debit.
                // For Supplier: Expense (Payment to them) is Debit. Income (Refund from them) is Credit.
                // Simplified:
                // Income (Money IN) -> Credit for Party (They gave us money)
                // Expense (Money OUT) -> Debit for Party (We gave them money)
                debit: t.transaction_type === 'expense' ? t.amount : 0,
                credit: t.transaction_type === 'income' ? t.amount : 0,
            })) as Payment[];
        },
        enabled: !!id
    });

    // Calculate stats
    const totalInvoices = invoices?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0;
    const totalPaid = invoices?.reduce((s, i) => s + (i.paid_amount || 0), 0) || 0;
    const totalRemaining = totalInvoices - totalPaid;
    const totalPayments = payments?.reduce((s, p) => s + (p.credit + p.debit || 0), 0) || 0;

    if (partyLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={4} />
            </div>
        );
    }

    if (!party) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الطرف غير موجود</p>
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
                        <div className={`p-3 rounded-xl ${party.type === 'customer' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                            <User className={`h-6 w-6 ${party.type === 'customer' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold">{party.name}</h1>
                            <Badge variant={party.type === 'customer' ? 'default' : 'secondary'}>
                                {party.type === 'customer' ? 'عميل' : 'مورد'}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className={`text-2xl font-bold ${party.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {party.balance.toLocaleString('ar-EG')} ج.م
                    <span className="block text-xs font-normal text-muted-foreground">الرصيد الحالي</span>
                </div>
            </div>

            {/* Contact Info */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">معلومات الاتصال</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{party.phone || 'غير محدد'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{party.email || 'غير محدد'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{party.address || 'غير محدد'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm text-blue-700 dark:text-blue-300">إجمالي الفواتير</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{totalInvoices.toLocaleString()}</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">{invoices?.length || 0} فاتورة</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-700 dark:text-green-300">المدفوع</span>
                        </div>
                        <p className="text-xl font-bold text-green-900 dark:text-green-100">{totalPaid.toLocaleString()}</p>
                        <p className="text-xs text-green-600 dark:text-green-400">ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">المستحق</span>
                        </div>
                        <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{totalRemaining.toLocaleString()}</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">ج.م</p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Banknote className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="text-sm text-purple-700 dark:text-purple-300">إجمالي السداد</span>
                        </div>
                        <p className="text-xl font-bold text-purple-900 dark:text-purple-100">{totalPayments.toLocaleString()}</p>
                        <p className="text-xs text-purple-600 dark:text-purple-400">{payments?.length || 0} عملية</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs: Invoices, Payments, Statement of Account */}
            <Tabs defaultValue="soa" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
                    <TabsTrigger value="soa">كشف الحساب</TabsTrigger>
                    <TabsTrigger value="invoices">الفواتير ({invoices?.length || 0})</TabsTrigger>
                    <TabsTrigger value="payments">المدفوعات ({payments?.length || 0})</TabsTrigger>
                </TabsList>

                {/* New Statement of Account Tab */}
                <TabsContent value="soa" className="mt-4">
                    <StatementOfAccountWithPrint
                        partyId={party.id}
                        party={{
                            name: party.name,
                            type: party.type,
                            phone: party.phone || undefined,
                            address: party.address || undefined,
                            balance: party.balance
                        }}
                    />
                </TabsContent>

                <TabsContent value="invoices" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            {invoices && invoices.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>رقم الفاتورة</TableHead>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>الإجمالي</TableHead>
                                                <TableHead>المدفوع</TableHead>
                                                <TableHead>الحالة</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invoices.map(inv => (
                                                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => navigate(`/commercial/${party.type === 'customer' ? 'selling' : 'buying'}/${inv.id}`)}>
                                                    <TableCell className="font-mono">{inv.invoice_number}</TableCell>
                                                    <TableCell>{format(new Date(inv.transaction_date), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell>{inv.total_amount.toLocaleString()}</TableCell>
                                                    <TableCell>{inv.paid_amount.toLocaleString()}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={inv.status === 'posted' ? 'default' : 'secondary'}>
                                                            {inv.status === 'posted' ? 'مُعتمدة' : inv.status === 'void' ? 'ملغاة' : 'مسودة'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    <p>لا توجد فواتير</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payments" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            {payments && payments.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>التاريخ</TableHead>
                                                <TableHead>البيان</TableHead>
                                                <TableHead>مدين</TableHead>
                                                <TableHead>دائن</TableHead>
                                                <TableHead>المرجع</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {payments.map(pay => (
                                                <TableRow key={pay.id}>
                                                    <TableCell>{format(new Date(pay.transaction_date), 'dd/MM/yyyy')}</TableCell>
                                                    <TableCell>{pay.description || '-'}</TableCell>
                                                    <TableCell className="text-red-600 dark:text-red-400 font-mono">
                                                        {pay.debit > 0 ? pay.debit.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-green-600 dark:text-green-400 font-mono">
                                                        {pay.credit > 0 ? pay.credit.toLocaleString() : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs">
                                                            {pay.reference_type === 'invoice' ? 'فاتورة' :
                                                                pay.reference_type === 'payment' ? 'سداد' :
                                                                    pay.reference_type === 'return' ? 'مرتجع' : pay.reference_type || '-'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                    <Banknote className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    <p>لا توجد مدفوعات</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ الإنشاء: {format(new Date(party.created_at), 'dd/MM/yyyy')}</span>
            </div>
        </div>
    );
}

// Statement of Account with Print functionality
interface PartyInfoForPrint {
    name: string;
    type: 'customer' | 'supplier';
    phone?: string;
    address?: string;
    balance: number;
}

function StatementOfAccountWithPrint({ partyId, party }: { partyId: string; party: PartyInfoForPrint }) {
    const printRef = useRef<HTMLDivElement>(null);

    const { data: entries, isLoading } = useQuery({
        queryKey: ['ledger_entries', partyId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('ledger_entries')
                .select('*')
                .eq('party_id', partyId)
                .order('transaction_date', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as LedgerEntry[];
        }
    });

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Statement-${party.name}`,
    });

    // Prepare print data
    const printData: StatementData = {
        party: {
            name: party.name,
            type: party.type,
            phone: party.phone,
            address: party.address,
            balance: party.balance
        },
        entries: (entries || []).map(e => ({
            id: e.id,
            transaction_date: e.transaction_date,
            reference_type: e.reference_type,
            description: e.description,
            debit: e.debit,
            credit: e.credit
        }))
    };

    if (isLoading) {
        return <div className="p-8 text-center"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div></div>;
    }

    if (!entries || entries.length === 0) {
        return (
            <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>لا توجد حركات مسجلة في كشف الحساب</p>
                </CardContent>
            </Card>
        );
    }

    // Calculate Running Balance
    let balance = 0;
    const entriesWithBalance = entries.map(entry => {
        balance = balance + (entry.debit || 0) - (entry.credit || 0);
        return { ...entry, balance };
    });

    // Reverse for display (Newest first)
    const reversedEntries = [...entriesWithBalance].reverse();

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span>كشف حساب تفصيلي</span>
                        <Button variant="outline" size="sm" onClick={() => handlePrint()} className="gap-2">
                            <Printer className="h-4 w-4" />
                            طباعة الكشف
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>نوع الحركة</TableHead>
                                    <TableHead>البيان / الوصف</TableHead>
                                    <TableHead className="text-left">مدين</TableHead>
                                    <TableHead className="text-left">دائن</TableHead>
                                    <TableHead className="text-left">الرصيد</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reversedEntries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-mono text-xs">{format(new Date(entry.transaction_date), 'yyyy-MM-dd')}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px] font-normal">
                                                {getRefLabel(entry.reference_type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={entry.description || ''}>
                                            {entry.description}
                                        </TableCell>
                                        <TableCell className="text-left font-mono text-red-600 dark:text-red-400">
                                            {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-left font-mono text-green-600 dark:text-green-400">
                                            {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                                        </TableCell>
                                        <TableCell className={`text-left font-mono font-bold ${entry.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {Math.abs(entry.balance).toLocaleString()} {entry.balance < 0 ? '(مستحق)' : ''}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Hidden Print Template */}
            <div style={{ display: 'none' }}>
                <StatementPrintTemplate ref={printRef} data={printData} />
            </div>
        </>
    );
}

function getRefLabel(type: string) {
    const map: Record<string, string> = {
        'sales_invoice': 'فاتورة بيع',
        'purchase_invoice': 'فاتورة شراء',
        'sales_return': 'مرتجع بيع',
        'purchase_return': 'مرتجع شراء',
        'payment': 'سند صرف',
        'receipt': 'سند قبض',
        'manual_transaction': 'تسوية يدوية'
    };
    return map[type] || type;
}

interface LedgerEntry {
    id: string;
    transaction_date: string;
    amount: number;
    type: string;
    reference_type: string;
    reference_id: string;
    description: string;
    debit: number;
    credit: number;
    created_at: string;
}
