import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FinancialService } from "@/services/FinancialService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cashCategory, cashDirection, cashInvoiceHref, type CashEntry } from '@/features/treasuries/treasury-statement';
import { statementMoney } from '@/features/parties/party-statement';

export function FinancialReversalDialog({ transactionId, context, onClose, onSuccess }: {
    transactionId: number;
    context?: { treasury: string; currency: string; row: CashEntry };
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [pairId, setPairId] = useState("");
    const plan = useQuery({ queryKey: ["financial-reversal", transactionId], queryFn: () => FinancialService.getReversalPlan(transactionId), retry: false, refetchOnWindowFocus: false, gcTime: 0 });
    const reversal = useMutation({
        mutationFn: () => FinancialService.reverseTransaction({ id: transactionId, ...(pairId ? { pairId: Number(pairId) } : {}) }),
        onSuccess,
    });
    const currency = context?.currency || 'العملة غير محددة';
    const needsPair = plan.data?.requires_pair;
    const missingPair = needsPair && !plan.data?.candidates.length;
    return (
        <Dialog open onOpenChange={open => { if (!open && !reversal.isPending) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>إلغاء الحركة المالية</DialogTitle>
                    <DialogDescription>يُعكس أثر الحركة على الخزينة والطرف والفاتورة المرتبطة في عملية واحدة، ثم تُحذف من الكشف الجاري. يُحفظ دليل الحركة الأصلية في سجل التدقيق.</DialogDescription>
                </DialogHeader>
                {context && <div className="rounded-lg border p-3 space-y-2 text-sm"><p>الخزنة: {context.treasury}</p><p>التاريخ: {context.row.transaction_date} · {cashCategory(context.row.category)}</p><p>الحركة الأصلية: {cashDirection(context.row) === 'in' ? 'وارد؛ الإلغاء يخصم من الخزنة' : cashDirection(context.row) === 'out' ? 'صادر؛ الإلغاء يعيد إلى الخزنة' : 'اتجاه يحتاج مراجعة'}</p>{context.row.party?.name && <p>الطرف: {context.row.party.name}</p>}{cashInvoiceHref(context.row) && <p>الحركة مرتبطة بفاتورة؛ سيُراجع مبلغ تسويتها وحالتها قبل الإلغاء.</p>}<p className="break-words whitespace-pre-wrap">{context.row.description || 'بدون بيان'}</p></div>}
                {(plan.isPending || plan.isFetching) && <p role="status">جارٍ تحميل تفاصيل الحركة…</p>}
                {plan.isError && <div role="alert"><p>{plan.error.message}</p><Button variant="outline" onClick={() => plan.refetch()}>إعادة التحميل</Button></div>}
                {plan.data && !plan.isError && <p>المبلغ: {statementMoney(plan.data.amount)} {currency}</p>}
                {needsPair && <div className="space-y-2">
                    <p>اختر الحركة المقابلة؛ سيُلغى التحويل من الخزينتين معًا.</p>
                    <SearchableSelect value={pairId} onValueChange={setPairId} placeholder="اختر الخزينة والحركة المقابلة"
                        disabled={reversal.isPending || missingPair}
                        options={plan.data!.candidates.map(candidate => ({ value: String(candidate.id),
                            label: `${candidate.treasury_name} — ${statementMoney(candidate.amount)} ${currency} — ${candidate.date}`,
                            description: candidate.description }))} />
                    {missingPair && <p role="alert">لم توجد حركة مقابلة موثقة. راجع قيد التحويل الأصلي قبل الإلغاء؛ لم يتغير أي رصيد.</p>}
                </div>}
                {reversal.isError && <p role="alert" className="text-destructive">{reversal.error.message}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={reversal.isPending} onClick={onClose}>رجوع</Button>
                    <Button variant="destructive" disabled={!plan.data || plan.isError || plan.isFetching || reversal.isPending || Boolean(needsPair && !plan.data.candidates.some(candidate => String(candidate.id) === pairId)) || Boolean(context && !cashDirection(context.row))} onClick={() => reversal.mutate()}>
                        {reversal.isPending ? "جارٍ إلغاء الحركة…" : needsPair ? "إلغاء التحويل من الخزينتين" : "إلغاء الحركة وعكس أثرها"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
