import { Button } from '@/components/ui/button';

interface ReferenceQuery { data?: readonly { id: number }[]; isPending: boolean; isFetching: boolean; isError: boolean }
export function ReferenceReadNotice({ query, label, retry, selectedValues = [] }: {
    query: ReferenceQuery; label: string; retry: () => void; selectedValues?: string[];
}) {
    const rows = query.data;
    const missing = rows !== undefined && selectedValues.some(value => !!value && !rows.some(row => String(row.id) === value));
    if (query.isError) return <div role="alert" className="space-y-2 rounded-lg border border-amber-400/60 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/20">
        <p>تعذر تحميل قائمة {label}. القيم المكتوبة باقية. {query.data ? 'المتاح للاختيار آخر نسخة قُرئت في هذه الصفحة.' : 'أعد المحاولة لاختيار بنود جديدة.'}</p>
        <Button type="button" variant="outline" aria-label={`إعادة تحميل قائمة ${label}`} disabled={query.isFetching} onClick={retry}>{query.isFetching ? 'جارٍ إعادة المحاولة…' : 'إعادة المحاولة'}</Button>
    </div>;
    if (query.isPending) return <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل قائمة {label}…</p>;
    if (missing || rows?.length === 0) return <div role={missing ? 'alert' : 'status'} className="space-y-2 rounded-lg border p-3 text-sm">
        <p>{missing ? `توجد اختيارات محفوظة غير متاحة في قائمة ${label}. حدّث القائمة أو راجع البنود قبل الحفظ.` : `قائمة ${label} فارغة حاليًا.`}</p>
        <Button type="button" variant="outline" aria-label={`إعادة تحميل قائمة ${label}`} disabled={query.isFetching} onClick={retry}>{query.isFetching ? 'جارٍ التحديث…' : 'تحديث القائمة'}</Button>
    </div>;
    return null;
}
