import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FinancialService } from "@/services/FinancialService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function FinancialReversalDialog({ transactionId, onClose, onSuccess }: {
    transactionId: number;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [pairId, setPairId] = useState("");
    const plan = useQuery({ queryKey: ["financial-reversal", transactionId], queryFn: () => FinancialService.getReversalPlan(transactionId) });
    const reversal = useMutation({
        mutationFn: () => FinancialService.reverseTransaction({ id: transactionId, ...(pairId ? { pairId: Number(pairId) } : {}) }),
        onSuccess,
    });
    const needsPair = plan.data?.requires_pair;
    const missingPair = needsPair && !plan.data?.candidates.length;
    return (
        <Dialog open onOpenChange={open => { if (!open && !reversal.isPending) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>إلغاء الحركة المالية</DialogTitle>
                    <DialogDescription>يُعكس أثر الحركة على الخزينة والطرف والفاتورة المرتبطة في عملية واحدة.</DialogDescription>
                </DialogHeader>
                {plan.isPending && <p role="status">جارٍ تحميل تفاصيل الحركة…</p>}
                {plan.isError && <div role="alert"><p>{plan.error.message}</p><Button variant="outline" onClick={() => plan.refetch()}>إعادة التحميل</Button></div>}
                {plan.data && <p>المبلغ: {plan.data.amount.toLocaleString()} ج.م</p>}
                {needsPair && <div className="space-y-2">
                    <p>اختر الحركة المقابلة؛ سيُلغى التحويل من الخزينتين معًا.</p>
                    <SearchableSelect value={pairId} onValueChange={setPairId} placeholder="اختر الخزينة والحركة المقابلة"
                        disabled={reversal.isPending || missingPair}
                        options={plan.data!.candidates.map(candidate => ({ value: String(candidate.id),
                            label: `${candidate.treasury_name} — ${candidate.amount.toLocaleString()} ج.م — ${candidate.date}`,
                            description: candidate.description }))} />
                    {missingPair && <p role="alert">لم توجد حركة مقابلة موثقة. راجع قيد التحويل الأصلي قبل الإلغاء؛ لم يتغير أي رصيد.</p>}
                </div>}
                {reversal.isError && <p role="alert" className="text-destructive">{reversal.error.message}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" disabled={reversal.isPending} onClick={onClose}>رجوع</Button>
                    <Button variant="destructive" disabled={!plan.data || reversal.isPending || Boolean(needsPair && !pairId)} onClick={() => reversal.mutate()}>
                        {reversal.isPending ? "جارٍ إلغاء الحركة…" : needsPair ? "إلغاء التحويل من الخزينتين" : "إلغاء الحركة وعكس أثرها"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
