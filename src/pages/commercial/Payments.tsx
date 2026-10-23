import { FormNumberInput } from '@/components/ui/number-input';
import { formatAmount as displayAmount } from '@/lib/number-format';
import {FinancialService} from '@/services/FinancialService';
import {paymentCategoryOptions} from '@/features/financial/category-policy';
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
import { ArrowUpCircle, ArrowDownCircle, RefreshCw, CreditCard, Loader2, Wallet, type LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { factoryBusinessDay, factoryMonthPeriod } from "@/platform/date/factory-business-day";

function newPaymentValues() { return {date:factoryBusinessDay(),treasury_id:'',category:'',party_id:'',invoice_id:'',amount:'',description:''}; }

export default function Payments() {
    const [params] = useSearchParams();
    const initialType = params.get('type') === 'expense' ? 'expense' : 'income';
    const requestedParty = params.get('party') ?? '';
    return (
        <div className="space-y-6">
            <PageHeader
                title="المقبوضات والمدفوعات"
                description="تسجيل العمليات المالية مع العملاء والموردين"
                icon={CreditCard}
            />

            {/* Tab-based Toggle for Mobile */}
            <Tabs key={`${initialType}:${requestedParty}`} defaultValue={initialType} className="w-full">
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
                        initialParty={initialType === 'income' ? requestedParty : ''}
                        type="income"
                        title="سند قبض (استلام نقدية)"
                        icon={ArrowDownCircle}
                        colorClass="text-green-600 dark:text-green-400"
                        bgClass="bg-green-50 dark:bg-green-950/30"
                    />
                </TabsContent>

                <TabsContent value="expense" className="mt-4">
                    <TransactionForm
                        initialParty={initialType === 'expense' ? requestedParty : ''}
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
    bgClass,
    initialParty = ''
}: {
    type: 'income' | 'expense',
    title: string,
    icon: LucideIcon,
    colorClass: string,
    bgClass: string,
    initialParty?: string
}) {
    const queryClient = useQueryClient();
    const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({defaultValues:newPaymentValues()});
    const initialApplied = useRef(false);

    // Watch party to fetch invoices
    const selectedPartyId = watch('party_id');

    const categoriesQuery = useQuery({queryKey:['financial_categories',type],queryFn:()=>FinancialService.getCategories(type),retry:false,refetchOnWindowFocus:false});
    // Fetch Data
    const { data: treasuries } = useQuery({ queryKey: ['treasuries'], queryFn: TreasuriesService.getTreasuries });
    const supplierQuery = useQuery({ queryKey: ['suppliers'], queryFn: () => PartiesService.getParties('supplier') });
    const customerQuery = useQuery({ queryKey: ['customers'], queryFn: () => PartiesService.getParties('customer') });
    const suppliers = supplierQuery.data, customers = customerQuery.data;
    const initialMatch = [...(suppliers ?? []), ...(customers ?? [])].find(p => p.id === initialParty);
    useEffect(() => {
        if (!initialParty || initialApplied.current || !suppliers || !customers) return;
        initialApplied.current = true;
        if (initialMatch && !selectedPartyId) {
            setValue('party_id', initialMatch.id);
            if ((type === 'income' && initialMatch.type === 'customer') || (type === 'expense' && initialMatch.type === 'supplier'))
                setValue('category', type === 'income' ? 'receipt' : 'payment');
        }
    }, [initialParty, suppliers, customers, initialMatch, selectedPartyId, setValue, type]);

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
            reset(newPaymentValues());
            queryClient.invalidateQueries({ queryKey: ['treasuries'] });
            queryClient.invalidateQueries({ queryKey: ['parties'] });
            queryClient.invalidateQueries({ queryKey: ['unpaid_invoices'] });
            queryClient.invalidateQueries({ queryKey: ['party-workspace'] });
            queryClient.invalidateQueries({ queryKey: ['financial_transactions'] });
        },
        onError: (e) => toast.error("خطأ: " + e.message)
    });

    const allParties = [...(suppliers || []), ...(customers || [])];

    const onSubmit = (data: ReturnType<typeof newPaymentValues>) => {
        if (!data.treasury_id || !data.amount || !data.category) {
            toast.error("يرجى ملء الحقول الإجبارية (الخزنة، البند، المبلغ)");
            return;
        }

        // Validate Party for specific categories
        const partyRequiredCategories = ['payment', 'purchase', 'receipt', 'refund'];
        if (partyRequiredCategories.includes(data.category) && !data.party_id) {
            toast.error("يرجى اختيار الجهة (العميل/المورد) لهذا البند");
            return;
        }

        mutation.mutate({
            treasury_id: parseInt(data.treasury_id),
            date: data.date,
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
                {(supplierQuery.isError || customerQuery.isError) && <p role="alert" className="mb-3 text-destructive">تعذر تحميل قائمة الأطراف كاملة. <Button type="button" variant="outline" onClick={() => { void supplierQuery.refetch(); void customerQuery.refetch(); }}>إعادة المحاولة</Button></p>}
                {initialParty && suppliers && customers && !initialMatch && <p role="alert" className="mb-3 text-destructive">لم نجد الطرف المطلوب في القائمة المتاحة لحسابك. اختر الجهة يدويًا.</p>}
                {initialMatch && <Button variant="link" asChild className="mb-3"><Link to={`/commercial/parties/${initialMatch.id}`}>العودة إلى كشف {initialMatch.name}</Link></Button>}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <FormField label="تاريخ السند" required error={errors.date?.message}>
                        <Input aria-label="تاريخ السند" type="date" {...register('date',{required:'اختر تاريخ السند'})}/>
                    </FormField>
                    {/* Treasury Field */}
                    <FormField label="الخزنة / البنك" required error={errors.treasury_id?.message as string}>
                        <SearchableSelect
                            options={treasuries?.map(t => ({
                                value: t.id.toString(),
                                label: t.name,
                                description: `رصيد: ${displayAmount(t.balance) || 0}`
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
                            options={paymentCategoryOptions(type,categoriesQuery.isError?[]:categoriesQuery.data??[],!!categoriesQuery.data&&!categoriesQuery.isError&&!categoriesQuery.isFetching)}
                            value={watch('category')}
                            onValueChange={(val) => setValue('category', val, { shouldValidate: true })}
                            placeholder="اختر البند *"
                            searchPlaceholder="ابحث..."
                        />
                    </FormField>

                    {categoriesQuery.isFetching&&<p role="status" className="text-sm">جارٍ قراءة البنود المعدّة؛ خيارات السند الأساسية متاحة.</p>}
                    {categoriesQuery.isError&&<div role="alert" className="text-sm"><p>تعذر تحميل البنود المعدّة؛ الخيارات الأساسية متاحة، ولا يمكن تأكيد أثرها على الأرباح الآن.</p><Button type="button" variant="outline" onClick={()=>void categoriesQuery.refetch()}>إعادة تحميل البنود</Button></div>}
                    <p className="text-xs text-muted-foreground">وصف البند يوضح أثره في الأرباح وفق الإعداد الحالي. التحصيل والسداد يظلان مرتبطين بالطرف والفاتورة عند اختيارهما.</p>
                    {/* Party Field */}
                    <FormField label="الجهة (عميل / مورد)">
                        <SearchableSelect
                            options={allParties.map(p => ({
                                value: p.id,
                                label: p.name,
                                description: p.type === 'supplier' ? 'مورد' : 'عميل'
                            }))}
                            value={watch('party_id')}
                            onValueChange={(val) => { setValue('party_id', val); setValue('invoice_id', ''); }}
                            placeholder="اختر الجهة"
                            searchPlaceholder="ابحث..."
                        />
                    </FormField>

                    {/* Invoice Link - Only show if party selected and has unpaid invoices */}
                    {selectedPartyId && unpaidInvoices && unpaidInvoices.length > 0 && (
                        <FormField label="ربط بفاتورة (اختياري)">
                            <SearchableSelect
                                options={unpaidInvoices.map((inv) => ({
                                    value: inv.id.toString(),
                                    label: `#${inv.invoice_number || inv.id}`,
                                    description: `متبقي: ${displayAmount((inv.total_amount - inv.paid_amount))}`
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
                                <FormNumberInput
                                    type="number"
                                    step="0.01"
                                    control={control} name={'amount'} rules={{required: "مطلوب", min: 0.01}}
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
                        const isFormValid = !!treasuryId && !!category && Number(amount) > 0;

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
    const period = factoryMonthPeriod();
    const [page,setPage]=useState(0);
    const query=useQuery({queryKey:['financial_transactions','recent',period.startDate,period.endDate],queryFn:()=>TreasuriesService.getPartyMonthTransactions(period),retry:false,refetchOnWindowFocus:false});
    const isLoading=query.isPending||query.isFetching;
    const transactions=!isLoading&&!query.isError?query.data:undefined;
    const currentPage=Math.min(page,Math.max(0,Math.ceil((transactions?.length??0)/50)-1));
    const visible=transactions?.slice(currentPage*50,(currentPage+1)*50)??[];


    return (
        <Card>
            <CardHeader className="flex flex-row items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base sm:text-lg">حركات الأطراف هذا الشهر</CardTitle><Button variant="outline" size="sm" disabled={isLoading} onClick={()=>void query.refetch()}>تحديث الحركات</Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : query.isError ? <div role="alert"><p>تعذر تحميل الحركات كاملة. أعد المحاولة؛ لم نعرض قائمة جزئية أو قديمة.</p><Button onClick={()=>void query.refetch()}>إعادة المحاولة</Button></div> : !transactions || transactions.length === 0 ? (
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
                                {visible.map((t) => (
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
                                        <td className="p-3">{transactionCategoryLabel(t.category)}</td>
                                        <td className={`p-3 font-bold ${t.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {displayAmount(t.amount)} ج.م
                                        </td>
                                        <td className="p-3">{t.treasury?.name || '-'}</td>
                                        <td className="p-3 text-muted-foreground max-w-[200px] truncate" title={t.description || ''}>
                                            {t.description || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex flex-wrap items-center justify-between gap-3 py-3"><p>عرض {currentPage*50+1}–{Math.min((currentPage+1)*50,transactions.length)} من {transactions.length} حركة</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>السابق</Button><Button variant="outline" disabled={(currentPage+1)*50>=transactions.length} onClick={()=>setPage(currentPage+1)}>التالي</Button></div></div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}


function transactionCategoryLabel(category:string){
 const labels:Record<string,string>={receipt:'تحصيل',payment:'سداد',purchase:'مشتريات',sales:'مبيعات',refund:'استرداد',sales_payment:'دفعة فاتورة بيع',purchase_payment:'دفعة فاتورة شراء',sales_void_refund:'رد دفعة إلغاء بيع',purchase_void_refund:'استرداد إلغاء شراء',salary:'رواتب',rent:'إيجار',utilities:'مرافق',maintenance:'صيانة',transport:'نقل وشحن',other_income:'إيراد آخر',other_expense:'مصروف آخر'};
 return category.startsWith('reversal_')?'عكس حركة':labels[category]??'حركة أخرى';
}
