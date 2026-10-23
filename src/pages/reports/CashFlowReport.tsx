import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Banknote } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { loadCashFlowReport } from '@/services/CashFlowReportService';
import { buildCashFlow, cashFlowOptions, cashFlowPreset, validCashPeriod, type CashFlowRow, type CashFlowView, type CashPeriodPreset } from '@/features/reports/cash-flow';
import { factoryBusinessDay } from '@/platform/date/factory-business-day';
import { cashCategory, cashInvoiceHref, treasuryCurrency } from '@/features/treasuries/treasury-statement';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrintButton } from '@/components/print/PrintLayout';
const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const monthFormat = new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', timeZone: 'UTC' });
function amount(value: string | null, currency: string) {
    if (value === null) return 'غير متاح';
    const numeric = Number(value);
    return numeric !== 0 && Math.abs(numeric) < 0.000001 ? `${numeric < 0 ? '−' : ''}أقل من 0.000001 ${currency}` : `${amountFormat.format(numeric)} ${currency}`;
}
function FlowMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold break-words">{value}</dd></div>; }
function MovementLabel({ row }: { row: CashFlowRow }) {
    const invoiceHref = cashInvoiceHref(row);
    return <div className="space-y-1 min-w-0 break-words"><p className="font-medium">{cashCategory(row.category)}{row.transfer && ' · تحويل بين الخزن'}</p>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{row.description || 'بدون بيان'}</p>
        {row.treasury && <Link className="block text-sm underline" to={`/commercial/treasuries/${row.treasury.id}`}>{row.treasury.name}</Link>}
        {row.party_id && <Link className="block text-sm underline" to={`/commercial/parties/${row.party_id}`}>{row.party?.name || 'عرض الطرف'}</Link>}
        {invoiceHref && <Link className="block text-sm underline" to={invoiceHref}>عرض الفاتورة المرتبطة</Link>}
        {row.issues.length > 0 && <p className="text-sm text-destructive">{row.issues.join(' · ')}</p>}
    </div>;
}
function MovementTable({ rows, currency }: { rows: CashFlowRow[]; currency: string }) {
    return <table className="w-full text-sm"><thead><tr className="border-b">{['مرجع الحركة', 'التاريخ', 'البند والخزنة', 'الاتجاه', 'المبلغ'].map(label => <th key={label} className="p-3 text-right">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-b align-top"><td className="p-3">FT-{row.id}</td><td className="p-3 whitespace-nowrap">{row.transaction_date}</td>
            <td className="p-3 max-w-sm"><MovementLabel row={row} /></td><td className="p-3">{row.direction === 'in' ? 'وارد' : row.direction === 'out' ? 'صادر' : 'غير معروف'}</td><td className="p-3 whitespace-nowrap">{amount(row.amountValue, currency)}</td></tr>)}</tbody>
    </table>;
}
function FlowSummary({ view, currency }: { view: CashFlowView; currency: string }) {
    const totals = view.summary!;
    return <>
        <section aria-label="ملخص الحركات المسجلة" className="rounded-xl border bg-card p-5"><dl className="grid gap-5 sm:grid-cols-3">
            <FlowMetric label="إجمالي الوارد المسجل" value={amount(totals.recordedIn, currency)} /><FlowMetric label="إجمالي الصادر المسجل" value={amount(totals.recordedOut, currency)} /><FlowMetric label="صافي حركة النقد" value={amount(totals.recordedNet, currency)} />
        </dl><p className="mt-4 text-sm text-muted-foreground">يشمل الإجمالي التحويلات بين الخزن. لا يتضمن رصيدًا افتتاحيًا.</p></section>
        <section aria-label="التحويلات والحركات الأخرى" className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>التحويلات بين الخزن</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4"><FlowMetric label="تحويلات واردة" value={amount(totals.transferIn, currency)} /><FlowMetric label="تحويلات صادرة" value={amount(totals.transferOut, currency)} /><FlowMetric label="صافي التحويلات" value={amount(totals.transferNet, currency)} /></dl></CardContent></Card>
            <Card><CardHeader><CardTitle>الحركات الأخرى</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4"><FlowMetric label="وارد الحركات الأخرى" value={amount(totals.externalIn, currency)} /><FlowMetric label="صادر الحركات الأخرى" value={amount(totals.externalOut, currency)} /><FlowMetric label="صافي الحركات الأخرى" value={amount(totals.externalNet, currency)} /></dl><p className="mt-3 text-xs text-muted-foreground">تشمل التحصيل والسداد والإيداع والصرف اليدوي وكل بند غير مسجل كتحويل. لا نصنفها تلقائيًا إلى تشغيل أو استثمار.</p></CardContent></Card>
        </section>
        {view.unbalancedTransfers && <p role="alert" className="rounded-lg border border-amber-400/50 p-4 text-sm">التحويلات غير متوازنة في النطاق المختار. قد يكون طرف خارج الفترة أو غير متاح في السجل الجاري. الأرقام معروضة كما سُجلت دون تسوية افتراضية.</p>}
    </>;
}
function FlowAnalysis({ view, currency }: { view: CashFlowView; currency: string }) {
    const chart = view.monthly.map(month => ({ month: month.month, incoming: Number(month.recordedIn), outgoing: Number(month.recordedOut) }));
    return <div className="space-y-4">
        {chart.length > 1 && <Card className="print:hidden"><CardHeader><CardTitle>حركة النقد الشهرية</CardTitle></CardHeader><CardContent><div className="h-[280px]" role="img" aria-label="مقارنة الوارد والصادر المسجل شهريًا؛ الجدول التفصيلي أدناه">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" tickFormatter={key => monthFormat.format(new Date(key + '-01T00:00:00Z'))} /><YAxis /><Tooltip formatter={value => amount(String(value), currency)} /><Legend /><Bar dataKey="incoming" name="الوارد المسجل" fill="#15803d" /><Bar dataKey="outgoing" name="الصادر المسجل" fill="#b45309" /></BarChart></ResponsiveContainer>
        </div></CardContent></Card>}
        {view.monthly.length > 0 && <section aria-label="ملخص الأشهر" className="rounded-xl border p-4"><h2 className="font-semibold mb-3">الملخص الشهري</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{view.monthly.map(month => <article key={month.month} className="rounded-lg border p-3 space-y-1 text-sm"><h3 className="font-semibold">{monthFormat.format(new Date(month.month + '-01T00:00:00Z'))}</h3><p>وارد: {amount(month.recordedIn, currency)}</p><p>صادر: {amount(month.recordedOut, currency)}</p><p>الصافي: {amount(month.recordedNet, currency)}</p></article>)}</div></section>}
        {view.breakdown.length > 0 && <section aria-label="تفصيل بنود الحركات الأخرى" className="rounded-xl border p-4"><h2 className="font-semibold mb-3">تفصيل بنود الحركات الأخرى</h2><div className="grid gap-2 sm:grid-cols-2">{view.breakdown.map(row => <div key={row.key} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/30 p-3 text-sm"><span>{row.label} · {row.direction === 'in' ? 'وارد' : 'صادر'}</span><strong>{amount(row.amount, currency)}</strong></div>)}</div></section>}
    </div>;
}
const periods: [CashPeriodPreset | 'custom', string][] = [['thisMonth', 'هذا الشهر'], ['lastMonth', 'الشهر الماضي'], ['last3Months', 'آخر 3 أشهر'], ['last6Months', 'آخر 6 أشهر'], ['thisYear', 'هذه السنة'], ['custom', 'فترة مخصصة']];
const selectStyle = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
export default function CashFlowReport() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [entryFilters] = useState(() => {
        const suppliedDates = searchParams.has('from') || searchParams.has('to');
        const treasuryValue = searchParams.get('treasury') ?? 'all';
        const treasuryValid = /^\d+$/.test(treasuryValue) && Number.isSafeInteger(Number(treasuryValue)) && Number(treasuryValue) > 0;
        const pageValue = Number(searchParams.get('page') ?? '1');
        return { dates: suppliedDates ? { from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '' } : cashFlowPreset('thisMonth', factoryBusinessDay()),
            preset: suppliedDates ? 'custom' as const : 'thisMonth' as const, treasury: treasuryValid ? treasuryValue : 'all',
            currency: searchParams.get('currency') ?? '', search: searchParams.get('q') ?? '', page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue - 1 : 0 };
    });
    const [preset, setPreset] = useState<CashPeriodPreset | 'custom'>(entryFilters.preset);
    const [dates, setDates] = useState(entryFilters.dates);
    const [treasury, setTreasury] = useState(entryFilters.treasury), [currencyKey, setCurrencyKey] = useState(entryFilters.currency);
    const [search, setSearch] = useState(entryFilters.search), [page, setPage] = useState(entryFilters.page);
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        for (const key of ['from', 'to', 'treasury', 'currency', 'q', 'page']) next.delete(key);
        next.set('from', dates.from); next.set('to', dates.to);
        if (treasury !== 'all') next.set('treasury', treasury);
        if (currencyKey) next.set('currency', currencyKey);
        if (search) next.set('q', search);
        if (page > 0) next.set('page', String(page + 1));
        if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    }, [dates.from, dates.to, treasury, currencyKey, search, page, searchParams, setSearchParams]);
    const treasuryId = treasury === 'all' ? null : Number(treasury), validPeriod = validCashPeriod(dates);
    const report = useQuery({ queryKey: ['cash-flow-report', dates.from, dates.to, treasuryId], queryFn: () => loadCashFlowReport({ ...dates, treasuryId }), enabled: validPeriod, retry: false, refetchOnWindowFocus: false });
    const ready = validPeriod && !report.isPending && !report.isFetching && !report.isError && !!report.data;
    const options = ready ? cashFlowOptions(report.data!, treasuryId) : [];
    const selectedCurrency = options.find(option => option.key === currencyKey) ?? options[0];
    const view = ready && selectedCurrency ? buildCashFlow(report.data!, { ...dates, treasuryId, currencyKey: selectedCurrency.key, search }) : null;
    const currency = selectedCurrency?.known ? treasuryCurrency(selectedCurrency.label) : 'عملة غير محددة';
    const treasuryName = treasuryId === null ? 'كل الخزن' : report.data?.treasuries.find(row => row.id === treasuryId)?.name ?? 'خزنة غير متاحة';
    const currentPage = Math.min(page, Math.max(0, Math.ceil((view?.rows.length ?? 0) / 50) - 1)), start = currentPage * 50, visible = view?.rows.slice(start, start + 50) ?? [];
    const changePeriod = (next: CashPeriodPreset | 'custom') => { setPreset(next); setPage(0); if (next !== 'custom') setDates(cashFlowPreset(next, factoryBusinessDay())); };
    return <div className="space-y-6 print:space-y-3 min-w-0">
        <header className="flex flex-wrap justify-between items-start gap-4 print:hidden"><div className="flex min-w-0 items-start gap-3"><Button variant="ghost" size="icon" aria-label="العودة للتقارير" asChild><Link to="/reports"><ArrowRight /></Link></Button><PageHeader title="التدفقات النقدية" description="حركة النقد المسجلة بتاريخ التحصيل والصرف، لكل عملة على حدة" icon={Banknote} /></div><div className="flex gap-2"><Button variant="outline" disabled={!validPeriod || report.isFetching} onClick={() => void report.refetch()}>تحديث التقرير</Button>{view?.summary && <PrintButton />}</div></header>
        <div className="hidden print:block border-b pb-3"><h1 className="text-2xl font-bold">التدفقات النقدية المسجلة</h1><p>{dates.from} إلى {dates.to} · {treasuryName} · {currency}</p><p>البحث: {search || 'كل الحركات'} · {view?.rows.length ?? 0} حركة</p></div>
        <p className="rounded-lg border bg-muted/30 p-4 text-sm">مبني على حركات الخزن المسجلة حاليًا بتاريخ كل حركة، ولا يجمع معها المدفوع المتراكم في الفواتير. الحركات الملغاة قد تُحذف من السجل، وإلغاء الفاتورة قد يظهر بحركة عكسية. لا يمثل رصيدًا افتتاحيًا أو إعادة بناء لحالة سابقة. العملات منفصلة دون تحويل أو جمع بينها.</p>
        <section aria-label="فلاتر التدفقات النقدية" className="rounded-xl border p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
            <label className="space-y-1 text-sm">الفترة<select aria-label="فترة التدفقات" className={selectStyle} value={preset} onChange={event => changePeriod(event.target.value as CashPeriodPreset | 'custom')}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1 text-sm">الخزنة<select aria-label="خزنة التدفقات" className={selectStyle} disabled={!ready} value={treasury} onChange={event => { setTreasury(event.target.value); setCurrencyKey(''); setPage(0); }}><option value="all">كل الخزن</option>{report.data?.treasuries.map(row => <option key={row.id} value={String(row.id)}>{row.name}</option>)}</select></label>
            <label className="space-y-1 text-sm">العملة<select aria-label="عملة التدفقات" className={selectStyle} disabled={!ready || !options.length} value={selectedCurrency?.key ?? ''} onChange={event => { setCurrencyKey(event.target.value); setPage(0); }}>{!options.length && <option value="">اختر نطاقًا متاحًا</option>}{options.map(option => <option key={option.key} value={option.key}>{option.known ? treasuryCurrency(option.label) : option.label}</option>)}</select></label>
            {preset === 'custom' && <><label className="space-y-1 text-sm">من تاريخ<Input aria-label="التدفقات من تاريخ" type="date" aria-invalid={!validPeriod} value={dates.from} onChange={event => { setDates(current => ({ ...current, from: event.target.value })); setPage(0); }} /></label><label className="space-y-1 text-sm">إلى تاريخ<Input aria-label="التدفقات إلى تاريخ" type="date" aria-invalid={!validPeriod} value={dates.to} onChange={event => { setDates(current => ({ ...current, to: event.target.value })); setPage(0); }} /></label></>}
        </section>
        {!validPeriod ? <p role="alert" className="text-destructive">أدخل تاريخ بداية ونهاية صحيحين، على أن يسبق تاريخ البداية النهاية أو يساويها. لم نطلب بيانات لفترة غير صالحة.</p>
            : report.isPending || report.isFetching ? <p role="status">جارٍ تحميل كامل الحركات والخزن…</p>
                : report.isError || !report.data ? <div role="alert" className="rounded-xl border p-5 space-y-3"><p>تعذر تحميل بيانات التدفقات كاملة. لم نعرض مجاميع جزئية.</p><Button onClick={() => void report.refetch()}>إعادة المحاولة</Button></div>
                    : !view ? <p role="status">لا توجد خزن متاحة في النطاق المختار.</p>
                        : <>
                            <div className="print:hidden"><Input aria-label="البحث في حركات التدفقات" placeholder="ابحث بالبيان أو البند أو الخزنة أو الطرف" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /><p className="mt-2 text-xs text-muted-foreground">البحث يرشّح الحركات والمجاميع معًا. النطاق: {treasuryName} · {currency} · {dates.from} إلى {dates.to}.</p></div>
                            {view.summary ? <FlowSummary view={view} currency={currency} /> : <p role="alert" className="rounded-lg border border-destructive p-4">أوقفنا المجاميع والطباعة: توجد حركة تحتاج مراجعة الخزنة أو العملة أو المبلغ أو الاتجاه أو التاريخ. الحركات المقروءة ظاهرة أدناه.</p>}
                            {view.unknownCurrencyRows.length > 0 && <section aria-label="حركات بلا عملة مؤكدة" className="rounded-lg border border-amber-400/50 p-4 space-y-2"><h2 className="font-semibold">{view.unknownCurrencyRows.length} حركة لا يمكن تحديد عملتها</h2><p className="text-sm">راجع الخزنة والعملة قبل الاعتماد على أي مجموع في هذا النطاق. يمكنك اختيار خزنة محددة مؤكدة العملة لعرض مجاميعها.</p>{view.unknownCurrencyRows.map(row => <p key={row.id} className="text-sm break-words">FT-{row.id} · {row.description || 'بدون بيان'} · {row.issues.join(' · ')}</p>)}</section>}
                            {view.summary && <FlowAnalysis view={view} currency={currency} />}
                            <section aria-label="حركات التدفقات النقدية" className="rounded-xl border p-4 space-y-4"><h2 className="text-lg font-semibold">الحركات ({view.rows.length})</h2><p className="text-sm text-muted-foreground print:hidden">الأحدث أولًا. اختيار خزنة أو عملة أو بحث يحدّث الحركات والمجاميع.</p>
                                <div className="hidden md:block print:hidden"><MovementTable rows={visible} currency={currency} /></div>
                                <div className="md:hidden print:hidden divide-y">{visible.map(row => <article key={row.id} className="py-4 space-y-3"><p className="text-xs text-muted-foreground">FT-{row.id} · {row.transaction_date}</p><MovementLabel row={row} /><p className="font-semibold">{row.direction === 'in' ? 'وارد' : row.direction === 'out' ? 'صادر' : 'اتجاه غير معروف'} · {amount(row.amountValue, currency)}</p></article>)}</div>
                                <div className="hidden print:block"><MovementTable rows={view.rows} currency={currency} /></div>
                                {view.rows.length === 0 && <p className="py-5 text-muted-foreground">لا توجد حركات في الفترة والنطاق المختارين.</p>}
                            </section>
                            {view.rows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 print:hidden"><p>عرض {start + 1}–{Math.min(start + 50, view.rows.length)} من {view.rows.length}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button><Button variant="outline" disabled={start + 50 >= view.rows.length} onClick={() => setPage(currentPage + 1)}>التالي</Button></div></div>}
                        </>}
    </div>;
}
