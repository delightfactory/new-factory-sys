import { useSyncExternalStore } from 'react';
import { getCacheReadNotice, subscribeCacheReadNotice } from '@/platform/pwa/cache-provenance';

export function CachedReadNotice() {
    const notice = useSyncExternalStore(subscribeCacheReadNotice, getCacheReadNotice, () => null);
    if (!notice) return null;
    return <aside role="status" className="mb-4 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm leading-7 text-amber-950 dark:bg-amber-950 dark:text-amber-100" dir="rtl">
        <p className="font-semibold">عُرضت بيانات محفوظة أثناء تعذر الاتصال بالخادم</p>
        <p>قد تتضمن صفحات هذه الجلسة بيانات لم تُحدَّث. تأكد من الاتصال وأعد تحميل الصفحة قبل الاعتماد على الأرصدة والتقارير؛ احفظ تعديلاتك أولًا.</p>
        {notice.oldestStoredAt !== null && <p>أقدم وقت حفظ معروف: <bdi>{new Date(notice.oldestStoredAt).toLocaleString('ar-EG')}</bdi>. هذا وقت حفظ نسخة محلية، وليس تأكيدًا لحداثة التقرير كاملًا.</p>}
        {notice.unknownTime && <p>وقت حفظ بعض البيانات غير معروف.</p>}
    </aside>;
}
