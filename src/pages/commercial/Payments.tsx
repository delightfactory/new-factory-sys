import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TreasuriesService } from "@/services/TreasuriesService";
import { PartiesService } from "@/services/PartiesService";
import { PurchaseInvoicesService } from "@/services/PurchaseInvoicesService";
import { SalesInvoicesService } from "@/services/SalesInvoicesService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, RefreshCw, CreditCard, Loader2, Wallet } from "lucide-react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { SearchableSelect } from "@/components/ui/searchable-select";

export default function Payments() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="المقبوضات والمدفوعات"
                description="تسجيل العمليات المالية مع العملاء والموردين"
                icon={CreditCard}
            />

            {/* Tab-based Toggle for Mobile */}
            <Tabs defaultValue="income" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-12">
                    <TabsTrigger value="income" className="text-sm sm:text-base gap-2">
                        <ArrowDownCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span>سند قبض</span>
                    </TabsTrigger>
                    <TabsTrigger value="expense" className="text-sm sm:text-base gap-2">
                        <ArrowUpCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span>سند صرف</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="income" className="mt-4">
                    <TransactionForm
                        type="income"
                        title="سند قبض (استلام نقدية)"
                        icon={ArrowDownCircle}
                        colorClass="text-green-600 dark:text-green-400"
                        bgClass="bg-green-50 dark:bg-green-950/30"
                    />
                </TabsContent>

                <TabsContent value="expense" className="mt-4">
                    <TransactionForm
                        type="expense"
                        title="سند صرف (دفع نقدية)"
                        icon={ArrowUpCircle}
                        colorClass="text-red-600 dark:text-red-400"
                        bgClass="bg-red-50 dark:bg-red-950/30"
                    />
                </TabsContent>
            </Tabs>

            <RecentTransactions />
        </div>
    );
}

function TransactionForm({
    type,
    title,
    icon: Icon,
    colorClass,
    bgClass
}: {
    type: 'income' | 'expense',
    title: string,
    icon: any,
    colorClass: string,
    bgClass: string
}) {
    const queryClient = useQueryClient();
    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm();

    // Watch party to fetch invoices
    const selectedPartyId = watch('party_id');

    // Fetch Data
    const { data: treasuries } = useQuery({ queryKey: ['treasuries'], queryFn: TreasuriesService.getTreasuries });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => PartiesService.getParties('supplier') });
    const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => PartiesService.getParties('customer') });

    // Fetch Unpaid Invoices if Party Selected
    const { data: unpaidInvoices } = useQuery({
        queryKey: ['unpaid_invoices', selectedPartyId, type],
        queryFn: async () => {
            if (!selectedPartyId) return [];
            if (type === 'expense') {
                return PurchaseInvoicesService.getUnpaidInvoices(selectedPartyId);
            } else {
                return SalesInvoicesService.getUnpaidInvoices(selectedPartyId);
            }
        },
        enabled: !!selectedPartyId
    });

    const mutation = useMutation({
        mutationFn: TreasuriesService.addTransaction,
        onSuccess: () => {
            toast.success("تم تسجيل العملية بنجاح");
            reset();
            queryClient.invalidateQueries({ queryKey: ['treasuries'] });
            queryClient.invalidateQueries({ queryKey: ['parties'] });
            queryClient.invalidateQueries({ queryKey: ['unpaid_invoices'] });
        },
        onError: (e) => toast.error("خطأ: " + e.message)
    });

    const allParties = [...(suppliers || []), ...(customers || [])];

    const onSubmit = (data: any) => {
        if (!data.treasury_id || !data.amount || !data.category) {
            toast.error("يرجى ملء الحقول الإجبارية (الخزنة، البند، المبلغ)");
            return;
        }

        mutation.mutate({
            treasury_id: parseInt(data.treasury_id),
            amount: parseFloat(data.amount),
            type: type,
            category: data.category,
            description: data.description,
            party_id: data.party_id || null,
            invoice_id: data.invoice_id ? parseInt(data.invoice_id) : null,
            invoice_type: data.invoice_id ? (type === 'expense' ? 'purchase' : 'sales') : null
        });
    };

    return (
        <Card className="overflow-hidden">
            {/* Colored Header */}
            <CardHeader className={`${bgClass} border-b`}>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Icon className={`h-5 w-5 ${colorClass}`} />
                    {title}
                </CardTitle>
                <CardDescription className="text-sm">
                    تسجيل {type === 'income' ? 'مقبوضات من عميل أو مورد' : 'مدفوعات لمورد أو عميل'}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Treasury Field */}
                    <FormField label="الخزنة / البنك" required error={errors.treasury_id?.message as string}>
                        <SearchableSelect
                            options={treasuries?.map(t => ({
                                value: t.id.toString(),
                                label: t.name,
                                description: `رصيد: ${t.balance?.toLocaleString() || 0}`
                            })) || []}
                            value={watch('treasury_id')}
                            onValueChange={(val) => setValue('treasury_id', val, { shouldValidate: true })}
                            placeholder="اختر الخزنة"
                            searchPlaceholder="ابحث عن خزنة..."
                        />
                    </FormField>

                    {/* Category Field - REQUIRED */}
                    <FormField label="البند" required error={errors.category?.message as string}>
                        <SearchableSelect
                            options={type === 'income' ? [
                                { value: 'receipt', label: 'تحصيل من عميل' },
                                { value: 'sales', label: 'إيراد مبيعات' },
                                { value: 'refund', label: 'استرداد' },
                                { value: 'other_income', label: 'إيراد آخر' },
                            ] : [
                                { value: 'payment', label: 'سداد مورد' },
                                { value: 'purchase', label: 'مشتريات' },
                                { value: 'salary', label: 'رواتب' },
                                { value: 'rent', label: 'إيجار' },
                                { value: 'utilities', label: 'مرافق (كهرباء/ماء/غاز)' },
                                { value: 'maintenance', label: 'صيانة' },
                                { value: 'transport', label: 'نقل وشحن' },
                                { value: 'other_expense', label: 'مصروف آخر' },
                            ]}
                            value={watch('category')}
                            onValueChange={(val) => setValue('category', val, { shouldValidate: true })}
                            placeholder="اختر البند *"
                            searchPlaceholder="ابحث..."
                        />
                    </FormField>

                    {/* Party Field */}
                    <FormField label="الجهة (عميل / مورد)">
                        <SearchableSelect
                            options={allParties.map(p => ({
                                value: p.id,
                                label: p.name,
                                description: p.type === 'supplier' ? 'مورد' : 'عميل'
                            }))}
                            value={watch('party_id')}
                            onValueChange={(val) => setValue('party_id', val)}
                            placeholder="اختر الجهة"
                            searchPlaceholder="ابحث..."
                        />
                    </FormField>

                    {/* Invoice Link - Only show if party selected and has unpaid invoices */}
                    {selectedPartyId && unpaidInvoices && unpaidInvoices.length > 0 && (
                        <FormField label="ربط بفاتورة (اختياري)">
                            <SearchableSelect
                                options={unpaidInvoices.map((inv: any) => ({
                                    value: inv.id.toString(),
                                    label: `#${inv.invoice_number || inv.id}`,
                                    description: `متبقي: ${(inv.total_amount - inv.paid_amount).toLocaleString()}`
                                }))}
                                value={watch('invoice_id')}
                                onValueChange={(val) => setValue('invoice_id', val)}
                                placeholder="اختر فاتورة"
                                searchPlaceholder="ابحث..."
                            />
                        </FormField>
                    )}

                    {/* Amount Field - Highlighted */}
                    <div className={`p-4 rounded-lg ${bgClass}`}>
                        <FormField label="المبلغ" required error={errors.amount?.message as string}>
                            <div className="relative">
                                <Input
                                    type="number"
                                    step="0.01"
                                    {...register('amount', { required: "مطلوب", min: 0.01 })}
                                    placeholder="0.00"
                                    className="text-lg sm:text-xl font-bold h-12 pr-16"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                                    ج.م
                                </span>
                            </div>
                        </FormField>
                    </div>

                    {/* Notes Field */}
                    <FormField label="ملاحظات / وصف">
                        <Textarea
                            {...register('description')}
                            placeholder="وصف العملية..."
                            className="min-h-[80px]"
                        />
                    </FormField>

                    {/* Submit Button - Disabled until required fields filled */}
                    {(() => {
                        const treasuryId = watch('treasury_id');
                        const category = watch('category');
                        const amount = watch('amount');
                        const isFormValid = !!treasuryId && !!category && amount > 0;

                        return (
                            <Button
                                type="submit"
                                className="w-full h-12 text-base sm:text-lg"
                                disabled={mutation.isPending || !isFormValid}
                            >
                                {mutation.isPending ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : !isFormValid ? (
                                    "أكمل البيانات المطلوبة"
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-5 w-5" />
                                        تسجيل {type === 'income' ? 'القبض' : 'الصرف'}
                                    </>
                                )}
                            </Button>
                        );
                    })()}
                </form>
            </CardContent>
        </Card>
    );
}

function RecentTransactions() {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ['financial_transactions', 'recent'],
        queryFn: async () => {
            // Fetch transactions for the current month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

            // Adjust imports if FinancialService is not imported at top
            const { FinancialService } = await import("@/services/FinancialService");
            return FinancialService.getTransactions({
                startDate: startOfMonth.split('T')[0],
                endDate: endOfMonth.split('T')[0]
            });
        }
    });

    return (
        <Card>
            <CardHeader className="flex flex-row items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base sm:text-lg">آخر العمليات (هذا الشهر)</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !transactions || transactions.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">لا توجد عمليات مسجلة هذا الشهر.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="p-3 text-right rounded-r-lg">التاريخ</th>
                                    <th className="p-3 text-right">النوع</th>
                                    <th className="p-3 text-right">البند</th>
                                    <th className="p-3 text-right">المبلغ</th>
                                    <th className="p-3 text-right">الخزنة</th>
                                    <th className="p-3 text-right rounded-l-lg">ملاحظات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t) => (
                                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                        <td className="p-3">{t.transaction_date}</td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${t.transaction_type === 'income'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                }`}>
                                                {t.transaction_type === 'income' ? 'قبض' : 'صرف'}
                                            </span>
                                        </td>
                                        <td className="p-3">{t.category}</td>
                                        <td className={`p-3 font-bold ${t.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {t.amount.toLocaleString()} ج.م
                                        </td>
                                        <td className="p-3">{t.treasury?.name || '-'}</td>
                                        <td className="p-3 text-muted-foreground max-w-[200px] truncate" title={t.description || ''}>
                                            {t.description || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

