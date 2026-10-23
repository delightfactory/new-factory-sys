import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link, useSearchParams} from 'react-router-dom';
import {Package, Download} from 'lucide-react';
import {readInventoryValuation} from '@/services/InventoryValuationReportService';
import {buildValuation, formatValuationNumber as number, valuationCsv, VALUATION_TYPES, type ValuationType, type ValuationRow} from '@/features/reports/inventory-valuation';
import {PageHeader} from '@/components/ui/page-header';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {PrintButton} from '@/components/print/PrintLayout';
const PAGE_SIZE = 100;
type Scope = {type: ValuationType | 'all'; search: string; page: number};
function readScope(params: URLSearchParams): Scope {
    const type = params.get('type') ?? 'all', page = Number(params.get('page') ?? 1);
    return {type: Object.hasOwn(VALUATION_TYPES, type) ? type as ValuationType : 'all', search: params.get('search') ?? '', page: Number.isSafeInteger(page) && page > 0 ? page : 1};
}
function ValuationTable({rows}: {rows: ValuationRow[]}) {
    return <Table className="print:table-fixed print:text-[8pt]"><TableHeader><TableRow><TableHead className="print:w-[40%]">الصنف</TableHead><TableHead>النوع</TableHead><TableHead>الكمية</TableHead><TableHead>تكلفة الوحدة</TableHead><TableHead>القيمة الحالية</TableHead></TableRow></TableHeader><TableBody>
        {rows.map(row => <TableRow key={row.key} data-valuation-key={row.key}><TableCell className="print:break-all"><Link className="font-medium underline underline-offset-4" to={VALUATION_TYPES[row.type].path+(row.type === 'bundle' ? '' : '/'+row.id)}>{row.name}</Link><span dir="ltr" className="block break-all text-xs text-muted-foreground">{row.code}</span>{row.type === 'bundle' && <span className="text-xs text-muted-foreground print:hidden">يفتح قائمة الباندلات</span>}{row.issues.map(issue => <p key={issue} className="text-xs text-amber-800 dark:text-amber-200">{issue}</p>)}</TableCell><TableCell>{VALUATION_TYPES[row.type].label}</TableCell><TableCell><bdi>{number(row.quantityValue)}</bdi> {row.unit ?? ''}</TableCell><TableCell><bdi>{number(row.costValue, true)}</bdi></TableCell><TableCell className="font-semibold"><bdi>{number(row.value, true)}</bdi></TableCell></TableRow>)}
    </TableBody></Table>;
}
export default function InventoryReport() {
    const [params, setParams] = useSearchParams();
    const scope = readScope(params);
    function setScope(update: Partial<Scope> | ((current: Scope) => Partial<Scope>)) {
        // The browser URL advances before router rendering during rapid input.
        const updated = new URLSearchParams(window.location.search);
        const patch = typeof update === 'function' ? update(readScope(updated)) : update;
        for (const [key, value] of Object.entries(patch)) {
            if (value === '' || key === 'type' && value === 'all' || key === 'page' && value === 1) updated.delete(key);
            else updated.set(key, String(value));
        }
        setParams(updated, {replace: true});
    }
    const query = useQuery({queryKey: ['report-inventory-valuation-v2'], queryFn: readInventoryValuation, retry: false, refetchOnWindowFocus: false});
    const ready = !!query.data && !query.isFetching && !query.isError;
    const view = useMemo(() => query.data ? buildValuation(query.data.sources, {type: scope.type, search: scope.search}) : null, [query.data, scope.type, scope.search]);
    const pageCount = Math.max(1, Math.ceil((view?.rows.length ?? 0)/PAGE_SIZE)), page = Math.min(scope.page, pageCount);
    const pageRows = view?.rows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE) ?? [];
    const canExport = ready && view !== null && view.invalidCount === 0;
    function exportCsv() {
        if (!canExport || !view || !query.data) return;
        const file = new Blob([valuationCsv(view, query.data.capturedAt)], {type: 'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(file), anchor = document.createElement('a');
        anchor.href = url; anchor.download = 'inventory-valuation-'+query.data.capturedAt.slice(0, 10)+'.csv';
        document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return <div className="space-y-5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><PageHeader title="تقرير تقييم المخزون" description="الأرصدة والتكلفة المسجلة حاليًا" icon={Package}/><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/reports">التقارير</Link></Button><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>تحديث التقرير</Button>{canExport && <PrintButton/>}<Button disabled={!canExport} onClick={exportCsv}><Download className="h-4 w-4 ml-2"/>تصدير CSV</Button></div></div>
        <h1 className="hidden print:block text-xl font-bold">تقرير تقييم المخزون</h1>
        <p className="text-sm text-muted-foreground">النطاق: المواد الخام ومواد التعبئة ونصف المصنع والمنتجات النهائية والباندلات النشطة فقط. القيمة = الرصيد الحالي × تكلفة الوحدة المسجلة، بالجنيه المصري؛ ليست تقييمًا تاريخيًا أو توقعًا للربح.</p>
        <p className="text-sm text-muted-foreground">البحث ونوع الصنف يحددان الجدول والإجمالي معًا. التصدير والطباعة يشملان كل نتائج الفلتر، مهما كانت صفحة العرض. القراءة ليست لقطة محاسبية ثابتة.</p>
        <div className="flex flex-wrap gap-3 items-end print:hidden"><label className="text-sm space-y-1 flex-1 min-w-0"><span>بحث بالاسم أو الكود</span><Input value={scope.search} onChange={event => setScope({search: event.target.value, page: 1})}/></label><label className="text-sm space-y-1"><span>نوع الصنف</span><select className="block h-10 rounded-md border bg-background px-3" value={scope.type} onChange={event => setScope({type: event.target.value as ValuationType | 'all', page: 1})}><option value="all">جميع الأنواع</option>{(Object.keys(VALUATION_TYPES) as ValuationType[]).map(type => <option key={type} value={type}>{VALUATION_TYPES[type].label}</option>)}</select></label></div>
        {query.isFetching && <p role="status" className="rounded-xl border bg-muted p-5">جارٍ قراءة أرصدة وتكلفة جميع الأنواع… سيظهر الإجمالي بعد اكتمال القراءة.</p>}
        {query.isError && <div role="alert" className="rounded-xl border border-destructive/40 p-5 space-y-3"><p>تعذر إكمال قراءة تقييم المخزون. أُخفي الإجمالي والتصدير والطباعة حتى لا تعتمد على تقرير ناقص. احتُفظ بالبحث والفلتر.</p><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>إعادة المحاولة</Button></div>}
        {ready && view && query.data && <>
            <p className="text-xs text-muted-foreground">اكتملت القراءة: <bdi>{new Date(query.data.capturedAt).toLocaleString('ar-EG')}</bdi> · الفلتر: {scope.type === 'all' ? 'جميع الأنواع' : VALUATION_TYPES[scope.type].label} · البحث: {scope.search || 'دون بحث'}.</p>
            {view.invalidCount > 0 && <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">يوجد {view.invalidCount} صنف يحتاج مراجعة الكمية أو التكلفة. الإجمالي غير متاح، والطباعة والتصدير متوقفان لهذا الفلتر. افحص ملاحظات الأصناف.</p>}
            <div className="grid gap-3 sm:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">قيمة المخزون لنفس الفلتر</CardTitle></CardHeader><CardContent><bdi className="text-xl font-bold" data-valuation-total="">{number(view.total, true)}</bdi></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">الأصناف المطابقة</CardTitle></CardHeader><CardContent className="text-xl font-bold" data-valuation-count="">{view.rows.length}</CardContent></Card></div>
            {!view.rows.length ? <p role="status" className="rounded-xl border p-6 text-center">لا توجد أصناف تطابق البحث ونوع الصنف.</p> : <>
                <Card className="print:hidden"><CardHeader><CardTitle>تفاصيل الأرصدة</CardTitle><p aria-live="polite" className="text-sm text-muted-foreground">الصفحة {page} من {pageCount} · عرض {pageRows.length} من {view.rows.length} صنف. الإجمالي لجميع نتائج الفلتر.</p></CardHeader><CardContent className="px-0"><div className="hidden md:block"><ValuationTable rows={pageRows}/></div><div className="space-y-3 px-4 md:hidden">{pageRows.map(row => <article key={row.key} data-valuation-card={row.key} className="rounded-xl border p-4 space-y-3"><div><h3 className="font-semibold"><Link className="underline underline-offset-4" to={VALUATION_TYPES[row.type].path+(row.type === 'bundle' ? '' : '/'+row.id)}>{row.name}</Link></h3><p className="text-xs text-muted-foreground">{VALUATION_TYPES[row.type].label}{row.type === 'bundle' ? ' · يفتح قائمة الباندلات' : ''}</p><bdi className="block break-all text-xs text-muted-foreground">{row.code}</bdi></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">الكمية</dt><dd className="break-all"><bdi>{number(row.quantityValue)}</bdi> {row.unit ?? ''}</dd></div><div><dt className="text-muted-foreground">تكلفة الوحدة</dt><dd className="break-all"><bdi>{number(row.costValue,true)}</bdi></dd></div><div className="col-span-2 border-t pt-2"><dt className="text-muted-foreground">القيمة الحالية بالجنيه المصري</dt><dd className="font-semibold break-all"><bdi>{number(row.value,true)}</bdi></dd></div></dl>{row.issues.map(issue => <p key={issue} className="text-xs text-amber-800 dark:text-amber-200">{issue}</p>)}</article>)}</div></CardContent></Card>
                <div className="hidden print:block"><ValuationTable rows={view.rows}/></div>
                <nav aria-label="صفحات تقييم المخزون" className="flex flex-wrap items-center justify-between gap-3 print:hidden"><Button variant="outline" disabled={page <= 1} onClick={() => setScope(current => ({page: Math.max(1, Math.min(current.page, pageCount)-1)}))}>الصفحة السابقة</Button><span className="text-sm">{page} / {pageCount}</span><Button variant="outline" disabled={page >= pageCount} onClick={() => setScope(current => ({page: Math.min(current.page, pageCount)+1}))}>الصفحة التالية</Button></nav>
            </>}
        </>}
    </div>;
}
