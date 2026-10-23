import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { coverageUncertain, type CoverageAttempt } from '@/features/packaging/coverage-intent';

function coverageLabel(attempt: CoverageAttempt): string {
    switch (attempt.stage) {
        case 'create_ready': return 'لم يُنشأ أمر الإنتاج بعد';
        case 'create_sent': return 'إنشاء أمر الإنتاج بانتظار تأكيد النتيجة';
        case 'created': return 'أمر الإنتاج محفوظ وينتظر التنفيذ';
        case 'production_sent': return 'تنفيذ الإنتاج بانتظار تأكيد النتيجة';
        case 'produced': return attempt.productionSkipped || attempt.mode === 'packaging-only' ? 'جاهز لتنفيذ التعبئة' : 'أمر الإنتاج مكتمل؛ التعبئة لم تكتمل بعد';
        case 'packaging_sent': return 'تنفيذ التعبئة بانتظار تأكيد النتيجة';
        case 'completed': return 'اكتمل أمر التعبئة';
        case 'cancelled': return 'توقفت محاولة التغطية';
    }
}

interface Props {
    attempt: CoverageAttempt;
    busy: boolean;
    error: string | null;
    onAdvance: () => void;
    onAllowShortage: () => void;
    onAdditional: () => void;
    onArchive: () => void;
}
export function CoverageProgress({ attempt, busy, error, onAdvance, onAllowShortage, onAdditional, onArchive }: Props) {
    const uncertain = coverageUncertain(attempt), terminal = ['completed', 'cancelled'].includes(attempt.stage);
    const action = uncertain ? 'تأكيد نتيجة الخطوة بنفس الطلب' : attempt.stage === 'create_ready' ? 'إعادة إنشاء الأمر بنفس الطلب' :
        attempt.stage === 'created' ? `تنفيذ أمر الإنتاج ${attempt.order?.code}` : attempt.packagingAction === 'complete_packaging_order_allow_shortage' ? 'إكمال التعبئة رغم النقص' : 'إكمال أمر التعبئة';
    return <section className="space-y-4" aria-label="مراحل تغطية النقص">
        <p role="status" className="rounded-lg bg-muted p-4 font-medium">{coverageLabel(attempt)}</p>
        {attempt.order && <p>أمر الإنتاج المحفوظ: <Link className="underline break-all" to={`/production/orders/${attempt.order.id}`}>{attempt.order.code}</Link></p>}
        <p className="text-sm text-muted-foreground">رقم أمر التعبئة: {attempt.packagingOrderId}. تُحفظ هذه المحاولة في هذا التبويب لهذا الحساب. إعادة المحاولة تستكمل الطلب المحفوظ.</p>
        {attempt.productionSkipped && attempt.order && <p className="text-sm text-amber-700">لم ننفّذ أمر الإنتاج ضمن هذه الخطوة. يظل الأمر المحفوظ متاحًا للمراجعة من صفحة الإنتاج.</p>}
        {attempt.observedElsewhere && <p>قُرئت الحالة من الخادم؛ نُفّذت أو أُلغيت هذه الخطوة من مسار آخر.</p>}
        {attempt.stoppedReason && <p role="status">{attempt.stoppedReason}</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {uncertain && <p className="rounded-lg border border-amber-300 p-3">نتيجة الطلب غير مؤكدة. لا تُنشئ أمرًا بديلًا. اضغط تأكيد النتيجة؛ الإغلاق والتنقل متوقفان لحين التحقق.</p>}
        <div className="flex flex-wrap gap-3">
            {!terminal && <Button disabled={busy} onClick={onAdvance}>{busy ? 'جارٍ تأكيد الخطوة…' : action}</Button>}
            {!terminal && !uncertain && attempt.packagingAction !== 'complete_packaging_order_allow_shortage' &&
                <Button variant="outline" disabled={busy} onClick={onAllowShortage}>تنفيذ التعبئة رغم النقص</Button>}
            {!uncertain && ['create_ready', 'produced', 'cancelled'].includes(attempt.stage) &&
                <Button variant="outline" disabled={busy} onClick={onAdditional}>تحديث التحليل وبدء محاولة إضافية</Button>}
            {terminal && <Button variant="outline" disabled={busy} onClick={onArchive}>إنهاء المتابعة مع حفظ السجل</Button>}
        </div>
    </section>;
}
