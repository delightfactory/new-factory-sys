import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, CreditCard, Search } from 'lucide-react';
import { loadProductCostCards } from '@/services/ProductCostCardService';
import type { CostLine, ProductCostCard } from '@/features/reports/cost-card';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PrintButton } from '@/components/print/PrintLayout';
import { formatNumber } from '@/lib/utils';
const costCurrency = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 6 });
const money = (value: string | null) => {
    if (value === null) return 'غير متاح';
    const amount = Number(value);
    if (amount !== 0 && Math.abs(amount) < 0.000001) return `${amount < 0 ? '−' : ''}أقل من 0.000001 ج.م`;
    return costCurrency.format(amount);
};
const quantity = (value: string | null) => value === null ? 'غير متاح' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(Number(value));
const percent = (value: string | null) => value === null ? '—' : `${formatNumber(Number(value))}%`;
function Metric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold break-words">{value}</dd></div>;
}
function RecipeLines({ rows, label }: { rows: CostLine[]; label: string }) {
    return <section aria-label={label} className="space-y-2"><h3 className="font-semibold">{label}</h3>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بنود مسجلة.</p> : rows.map(row =>
            <div key={row.id} className="rounded-lg border p-3 space-y-2 break-words">
                <p className="font-medium">{row.name}</p><dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <Metric label="الكمية" value={`${quantity(row.quantity)} ${row.unit}`} />
                    <Metric label="تكلفة الوحدة الحالية" value={money(row.unitCost)} />
                    <Metric label="تكلفة البند" value={money(row.cost)} />
                </dl>
            </div>)}
    </section>;
}
function ProductDetails({ card }: { card: ProductCostCard }) {
    const detail = useRef<HTMLDivElement>(null);
    useEffect(() => { detail.current?.focus(); }, [card.product.id]);
    return <Card ref={detail} tabIndex={-1} id="cost-card-detail" aria-label={`تفاصيل تكلفة ${card.product.name}`} className="print:break-inside-avoid">
        <CardHeader><CardTitle>بطاقة تكلفة: {card.product.name}</CardTitle>
            <CardDescription className="break-words">{card.product.code} · {card.product.unit} · الرصيد {formatNumber(card.product.quantity)}</CardDescription></CardHeader>
        <CardContent className="space-y-6">
            {card.warnings.length > 0 && <section aria-label="تنبيهات بيانات التكلفة" className="rounded-lg border border-amber-400/50 bg-amber-50/40 p-4 dark:bg-amber-950/20">
                <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> راجع بيانات الوصفة</h3>
                <ul className="list-disc ps-5 mt-2 text-sm space-y-2">{card.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            </section>}
            <section aria-label="نصف المصنع المستخدم" className="space-y-3">
                <h3 className="font-semibold">{card.semiName}</h3>
                <dl className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4">
                    <Metric label="كمية نصف المصنع لكل وحدة نهائية" value={quantity(card.semiQuantity)} />
                    <Metric label="تكلفته وفق القيمة المسجلة" value={money(card.semiRecorded)} />
                </dl>
            </section>
            {card.product.semi_finished_id !== null && <section className="space-y-3">
                <RecipeLines rows={card.rawRows} label="خامات تشغيلة نصف المصنع" />
                <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                    <Metric label="حجم التشغيلة" value={quantity(card.batchSize)} />
                    <Metric label="تكلفة خامات التشغيلة الحالية" value={money(card.batchCost)} />
                    <Metric label="تقدير خامات وحدة نصف المصنع" value={money(card.rawUnitEstimate)} />
                    <Metric label="تقدير الخامات المستخدمة لكل وحدة نهائية" value={money(card.rawForFinished)} />
                </dl>
                <p className="text-sm text-muted-foreground">هذه مقارنة لخامات الوصفة الحالية. تقدير التعبئة أدناه يستخدم تكلفة نصف المصنع المسجلة، كما يفعل التنفيذ الحالي.</p>
            </section>}
            <RecipeLines rows={card.packagingRows} label="مواد التعبئة لكل وحدة نهائية" />
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-5 rounded-lg bg-muted/40 p-4">
                <Metric label="تكلفة نصف المصنع المسجلة × الكمية" value={money(card.semiRecorded)} />
                <Metric label="تكلفة مواد التعبئة الحالية" value={money(card.packagingCost)} />
                <Metric label="تقدير التعبئة الحالية" value={money(card.estimate)} />
                <Metric label="التكلفة المسجلة حاليًا للمنتج" value={money(card.recorded)} />
                <Metric label="الفرق: التقدير ناقص المسجل" value={money(card.difference)} />
                <Metric label="سعر البيع" value={money(card.salesPrice)} />
                <Metric label="هامش الوحدة على التكلفة المسجلة" value={money(card.marginAmount)} />
                <Metric label="نسبة الهامش على المسجل" value={percent(card.marginPercent)} />
                <Metric label="نسبة الهامش على التقدير" value={percent(card.estimateMargin)} />
            </dl>
        </CardContent>
    </Card>;
}
export default function ProductCostCardReport() {
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const report = useQuery({ queryKey: ['product-cost-cards'], queryFn: loadProductCostCards, retry: false, refetchOnWindowFocus: false });
    const ready = !report.isPending && !report.isFetching && !report.isError && !!report.data;
    const products = ready ? report.data! : [];
    const filtered = products.filter(card => `${card.product.code} ${card.product.name}`.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar')));
    const selected = products.find(card => card.product.id === selectedProduct);
    const margins = filtered.flatMap(card => card.marginPercent === null ? [] : [Number(card.marginPercent)]);
    const summary = margins.reduce((result, value) => ({ sum: result.sum + value, min: Math.min(result.min, value), max: Math.max(result.max, value) }), { sum: 0, min: Infinity, max: -Infinity });
    const choose = (id: number, trigger: HTMLButtonElement) => {
        if (selectedProduct === id) { setSelectedProduct(null); trigger.focus(); } else setSelectedProduct(id);
    };
    const productButton = (card: ProductCostCard) => <><button type="button" className="print:hidden text-start text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 rounded-sm break-words" aria-expanded={selectedProduct === card.product.id} aria-controls={selectedProduct === card.product.id ? 'cost-card-detail' : undefined} onClick={event => choose(card.product.id, event.currentTarget)}>
        {card.product.name}<span className="block text-xs text-muted-foreground break-all">{card.product.code}</span>
    </button><span className="hidden print:block break-words">{card.product.name}<span className="block text-xs break-all">{card.product.code}</span></span></>;
    return <div className="space-y-6 print:space-y-3">
        <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
            <div className="flex min-w-0 items-start gap-3">
                <Button variant="ghost" size="icon" aria-label="العودة للتقارير" asChild><Link to="/reports"><ArrowRight /></Link></Button>
                <PageHeader title="بطاقة تكلفة المنتج" description="قارن التكلفة المسجلة بتقدير التعبئة من الوصفة الحالية" icon={CreditCard} />
            </div>
            <div className="flex gap-2">{ready && products.length > 0 && <PrintButton />}<Button variant="outline" disabled={report.isFetching} onClick={() => void report.refetch()}>تحديث التقرير</Button></div>
        </header>
        <div className="hidden print:block border-b pb-3"><h1 className="text-2xl font-bold">بطاقة تكلفة المنتجات</h1><p>تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p><p>نطاق العرض: {search.trim() || 'كل المنتجات'} · {filtered.length} من {products.length}</p></div>
        <p className="rounded-lg border bg-muted/30 p-4 text-sm">التكلفة المسجلة قد تعكس حركات سابقة أو اعتمادًا يدويًا. التقدير للعرض فقط ولا يغيّر تقييم المخزون أو قيوده. لا تشمل المقارنة مصروفات تشغيل غير مسجلة ضمن الوصفة.</p>
        {report.isPending || report.isFetching ? <p role="status" className="p-6">جارٍ تحميل بيانات التكلفة كاملة…</p>
            : report.isError || !report.data ? <Card><CardContent className="pt-6 space-y-3"><p role="alert">تعذر تحميل بيانات التكلفة كاملة. لم نعرض أرقامًا جزئية.</p><Button onClick={() => void report.refetch()}>إعادة المحاولة</Button></CardContent></Card>
                : products.length === 0 ? <Card><CardContent className="pt-6">لا توجد منتجات نهائية لعرض بطاقة تكلفتها.</CardContent></Card>
                    : <>
                        <div className="relative print:hidden"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-10" aria-label="البحث في بطاقات التكلفة" placeholder="ابحث باسم المنتج أو الكود" value={search} onChange={event => setSearch(event.target.value)} /></div>
                        <p className="text-sm text-muted-foreground">عرض {filtered.length} من {products.length} منتج. ملخص الهامش للنتائج الظاهرة ذات سعر بيع موجب وتكلفة مسجلة متاحة.</p>
                        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-xl border p-4">
                            <Metric label="منتجات بحاجة لمراجعة البيانات" value={String(filtered.filter(card => card.warnings.length > 0).length)} />
                            <Metric label="متوسط نسبة الهامش على المسجل" value={margins.length ? `${formatNumber(summary.sum / margins.length)}%` : '—'} />
                            <Metric label="أقل نسبة هامش" value={margins.length ? `${formatNumber(summary.min)}%` : '—'} />
                            <Metric label="أعلى نسبة هامش" value={margins.length ? `${formatNumber(summary.max)}%` : '—'} />
                        </dl>
                        {filtered.length === 0 ? <p role="status">لا توجد منتجات تطابق البحث.</p> : <>
                            <div className="grid gap-3 md:hidden print:hidden">{filtered.map(card => <Card key={card.product.id}><CardContent className="pt-4 space-y-4">
                                <div className="flex items-start justify-between gap-2">{productButton(card)}{card.warnings.length > 0 && <Badge variant="outline">راجع البيانات</Badge>}</div>
                                <dl className="grid grid-cols-2 gap-4 text-sm"><Metric label="التكلفة المسجلة" value={money(card.recorded)} /><Metric label="تقدير التعبئة الحالية" value={money(card.estimate)} />
                                    <Metric label="الفرق عن المسجل" value={money(card.difference)} /><Metric label="سعر البيع" value={money(card.salesPrice)} />
                                    <Metric label="هامش الوحدة على المسجل" value={money(card.marginAmount)} /><Metric label="نسبة الهامش" value={percent(card.marginPercent)} /></dl>
                            </CardContent></Card>)}</div>
                            <div className="hidden md:block print:block print:[&>div]:overflow-visible"><Table className="print:table-fixed print:[&_th]:text-[8pt] print:[&_td]:text-[8pt] print:[&_th:first-child]:w-1/4 print:[&_td]:break-words"><TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>التكلفة المسجلة</TableHead><TableHead>تقدير التعبئة</TableHead><TableHead>الفرق عن المسجل</TableHead><TableHead>سعر البيع</TableHead><TableHead>هامش الوحدة على المسجل</TableHead><TableHead>النسبة</TableHead></TableRow></TableHeader>
                                <TableBody>{filtered.map(card => <TableRow key={card.product.id}><TableCell>{productButton(card)}{card.warnings.length > 0 && <Badge variant="outline" className="ms-2">راجع البيانات</Badge>}</TableCell>
                                    <TableCell>{money(card.recorded)}</TableCell><TableCell>{money(card.estimate)}</TableCell><TableCell>{money(card.difference)}</TableCell><TableCell>{money(card.salesPrice)}</TableCell><TableCell>{money(card.marginAmount)}</TableCell><TableCell>{percent(card.marginPercent)}</TableCell>
                                </TableRow>)}</TableBody></Table></div>
                        </>}
                        {selectedProduct !== null && !selected && <p role="status">المنتج المختار لم يعد موجودًا في بيانات التقرير الحالية.</p>}
                        {selected && <ProductDetails card={selected} />}
                    </>}
    </div>;
}

