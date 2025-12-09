import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TreasuriesService } from "@/services/TreasuriesService";
import { PartiesService } from "@/services/PartiesService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, RefreshCw, CreditCard, Loader2 } from "lucide-react";
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Receipt Card (Income) */}
                <TransactionForm type="income" title="سند قبض (استلام نقدية)" icon={ArrowDownCircle} color="text-green-600" />

                {/* Payment Card (Expense) */}
                <TransactionForm type="expense" title="سند صرف (دفع نقدية)" icon={ArrowUpCircle} color="text-red-600" />
            </div>

            <RecentTransactions />
        </div>
    );
}

import { PurchaseInvoicesService } from "@/services/PurchaseInvoicesService";
import { SalesInvoicesService } from "@/services/SalesInvoicesService";

// ... existing imports

function TransactionForm({ type, title, icon: Icon, color }: { type: 'income' | 'expense', title: string, icon: any, color: string }) {
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
            // If paying (Expense) -> Look for Purchase Invoices (Supplier)
            if (type === 'expense') {
                return PurchaseInvoicesService.getUnpaidInvoices(selectedPartyId);
            }
            // If receiving (Income) -> Look for Sales Invoices (Customer)
            else {
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

    // ... onSubmit ...
    const onSubmit = (data: any) => {
        if (!data.treasury_id || !data.amount) {
            toast.error("يرجى ملء الحقول الإجبارية");
            return;
        }

        mutation.mutate({
            treasury_id: parseInt(data.treasury_id),
            amount: parseFloat(data.amount),
            type: type,
            category: type === 'income' ? 'receipt' : 'payment',
            description: data.description,
            party_id: data.party_id || null,
            invoice_id: data.invoice_id ? parseInt(data.invoice_id) : null,
            invoice_type: data.invoice_id ? (type === 'expense' ? 'purchase' : 'sales') : null
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Icon className={color} />
                    {title}
                </CardTitle>
                <CardDescription>تسجيل {type === 'income' ? 'مقبوضات من عميل أو مورد' : 'مدفوعات لمورد أو عميل'}</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <FormField label="الخزنة / البنك" required error={errors.treasury_id?.message as string}>
                        <SearchableSelect
                            options={treasuries?.map(t => ({ value: t.id.toString(), label: `${t.name} (رصيد: ${t.balance})` })) || []}
                            value={watch('treasury_id')}
                            onValueChange={(val) => setValue('treasury_id', val, { shouldValidate: true })}
                            placeholder="اختر الخزنة"
                            searchPlaceholder="ابحث عن خزنة..."
                        />
                    </FormField>

                    <FormField label="الجهة (عميل / مورد)">
                        <SearchableSelect
                            options={allParties.map(p => ({ value: p.id, label: `${p.name} (${p.type === 'supplier' ? 'مورد' : 'عميل'})` }))}
                            value={watch('party_id')}
                            onValueChange={(val) => setValue('party_id', val)}
                            placeholder="اختر الجهة"
                            searchPlaceholder="ابحث..."
                        />
                    </FormField>

                    {selectedPartyId && unpaidInvoices && unpaidInvoices.length > 0 && (
                        <FormField label="ربط بفاتورة (اختياري)">
                            <SearchableSelect
                                options={unpaidInvoices.map((inv: any) => ({
                                    value: inv.id.toString(),
                                    label: `#${inv.invoice_number || inv.id} | متبقي: ${(inv.total_amount - inv.paid_amount).toLocaleString()}`
                                }))}
                                value={watch('invoice_id')}
                                onValueChange={(val) => setValue('invoice_id', val)}
                                placeholder="اختر فاتورة"
                                searchPlaceholder="ابحث..."
                            />
                        </FormField>
                    )}

                    <FormField label="المبلغ" required error={errors.amount?.message as string}>
                        <Input type="number" step="0.01" {...register('amount', { required: "مطلوب", min: 0.01 })} placeholder="0.00" />
                    </FormField>

                    <FormField label="ملاحظات / وصف">
                        <Textarea {...register('description')} placeholder="وصف العملية..." />
                    </FormField>

                    <Button type="submit" className="w-full" disabled={mutation.isPending}>
                        {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        تسجيل {type === 'income' ? 'القبض' : 'الصرف'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function RecentTransactions() {
    // Placeholder for transaction history
    return (
        <Card>
            <CardHeader>
                <CardTitle>آخر العمليات</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground text-sm">سيتم عرض سجل العمليات هنا قريباً.</p>
            </CardContent>
        </Card>
    )
}
