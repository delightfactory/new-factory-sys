import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Decimal from 'decimal.js-light';
import { readProductPerformance } from '@/services/ProductPerformanceService';
import { buildProductPerformance, formatPerformanceNumber as number, performanceComponent, type PerformanceRow } from '@/features/reports/product-performance';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogReadState } from '@/components/ui/catalog-read-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PrintButton } from '@/components/print/PrintLayout';
import { TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Sort = 'totalRevenue' | 'marginPercent' | 'totalSold' | 'potentialRevenue' | 'name';
const money = (value: string | null) => number(value, true);
export default function ProductPerformanceReport() {
    const [sort, setSort] = useState<Sort>('totalRevenue');
    const [search, setSearch] = useState('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const query = useQuery({ queryKey: ['report-product-performance-complete'], queryFn: readProductPerformance, retry: false });
    const report = useMemo(() => query.data ? buildProductPerformance(query.data) : undefined, [query.data]);
    const sorted = useMemo(() => (report?.rows ?? []).filter(row => `${row.name} ${row.code}`.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar')))
        .sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name, 'ar');
            if (a[sort] === null) return b[sort] === null ? a.key.localeCompare(b.key) : 1;
            if (b[sort] === null) return -1;
            return new Decimal(b[sort]!).cmp(a[sort]!) || a.key.localeCompare(b.key);
        }), [report, search, sort]);
    const selected = report?.rows.find(row => row.key === selectedKey);
    const chart = report?.totalRevenue !== null ? report?.topRevenue.map(row => ({ name: row.name, revenue: Number(row.totalRevenue) })) ?? [] : [];
    function summary(label: string, value: string) { return <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="text-xl font-bold break-all" dir="ltr">{value}</CardContent></Card>; }
    function itemLink(row: PerformanceRow) { return row.type === 'product' ? `/inventory/finished/${row.id}` : null; }
    return <div className="min-w-0 space-y-6 print:w-full print:space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between print:hidden">
            <PageHeader title="أداء المنتجات والباندلات" description="بنود البيع المنشورة وهامش السعر الحالي" icon={TrendingUp} />
            <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/reports">التقارير</Link></Button><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>تحديث التقرير</Button>{report && !query.isFetching && !query.isError && <PrintButton />}</div>
        </div>
        <h1 className="hidden print:block text-xl font-bold">أداء المنتجات والباندلات</h1>
        <div className="rounded-xl border bg-muted/30 p-4 text-sm space-y-2">
            <p>النطاق: المنتجات النهائية والباندلات النشطة، وجميع بنود بيعها في الفواتير المنشورة المتاحة لهذا الحساب. القيم قبل المرتجعات وخصومات وضرائب وشحن الفاتورة، وليست إجمالي مبيعات المصنع.</p>
            <p>الهامش من السعر والتكلفة الحاليين؛ تكلفة الباندل من مكوناته الحالية. هذه ليست ربحية المبيعات التاريخية. البحث يغيّر الجدول فقط؛ الملخص والرسم لجميع الأصناف في النطاق.</p>
            {query.data && <p>اكتملت القراءة: {new Date(query.data.capturedAt).toLocaleString('ar-EG')}. تحديث البيانات يجدد التقرير؛ القراءة ليست لقطة محاسبية ثابتة.</p>}
        </div>
        <CatalogReadState query={{ ...query, data: report?.rows }} entity="تقرير أداء المنتجات" onRetry={() => void query.refetch()}>
            {report && <>
                {!!report.excludedSales && <p role="status" className="rounded-lg border border-amber-400/60 p-3 text-sm">يوجد {report.excludedSales} بند بيع خارج الأصناف المعروضة، مثل أنواع أصناف أخرى أو باندلات غير نشطة؛ لم تدخل في هذا الإجمالي.</p>}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {summary('قيمة بنود البيع المنشورة ضمن النطاق', money(report.totalRevenue))}
                    {summary('قيمة الرصيد بالسعر الحالي', money(report.totalPotential))}
                    {summary('متوسط هامش السعر الحالي للمنتجات النهائية', report.averageMargin === null ? 'غير متاح' : number(new Decimal(report.averageMargin).toDecimalPlaces(4).toString()) + '%')}
                    {summary('المنتجات النهائية والباندلات النشطة', String(report.rows.length))}
                </div>
                {chart.length > 0 && <Card className="print:hidden"><CardHeader><CardTitle>أعلى الأصناف بقيمة بنود البيع المنشورة</CardTitle></CardHeader><CardContent><div className="h-[300px]" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{ left: 15, right: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} /><Tooltip formatter={value => money(String(value))} /><Bar dataKey="revenue" name="قيمة بنود البيع" fill="#087d78" /></BarChart></ResponsiveContainer></div><p className="text-xs text-muted-foreground">الرسم يعرض أعلى8 أصناف حسب الإيراد، مستقلًا عن ترتيب الجدول. الأرقام التفصيلية في الجدول.</p></CardContent></Card>}
                {report.totalRevenue !== null && report.topRevenue.length > 0 && <Card className="hidden print:block"><CardHeader><CardTitle>أعلى الأصناف بقيمة بنود البيع المنشورة</CardTitle></CardHeader><CardContent><ol className="space-y-1">{report.topRevenue.map(row => <li key={row.key} className="flex justify-between gap-4"><span>{row.name}</span><span dir="ltr">{money(row.totalRevenue)}</span></li>)}</ol></CardContent></Card>}
                <Card><CardHeader><CardTitle>تفاصيل الأصناف</CardTitle><div className="flex flex-wrap items-end gap-3 print:hidden"><label className="space-y-1 text-sm"><span>بحث بالاسم أو الكود</span><Input value={search} onChange={event => setSearch(event.target.value)} /></label><label className="space-y-1 text-sm"><span>ترتيب الجدول</span><select className="block h-10 rounded-md border bg-background px-3" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="totalRevenue">قيمة بنود البيع</option><option value="marginPercent">هامش السعر الحالي</option><option value="totalSold">الكمية المباعة</option><option value="potentialRevenue">قيمة الرصيد الحالية</option><option value="name">الاسم</option></select></label></div><p className="text-sm text-muted-foreground">عرض {sorted.length} من {report.rows.length} صنف. الهامش تقديري حالي، والإيراد من بنود البيع المنشورة قبل تسويات الفاتورة.</p></CardHeader>
                <CardContent className="px-0"><Table className="print:table-fixed print:text-[8pt]"><TableHeader><TableRow><TableHead className="print:w-[30%]">الصنف</TableHead><TableHead>التكلفة الحالية</TableHead><TableHead>السعر الحالي</TableHead><TableHead>هامش السعر الحالي</TableHead><TableHead>الرصيد</TableHead><TableHead>الكمية المباعة</TableHead><TableHead>قيمة بنود البيع</TableHead><TableHead className="print:hidden">التفاصيل</TableHead></TableRow></TableHeader><TableBody>
                {!sorted.length && <TableRow><TableCell colSpan={8} className="text-center py-8">{search ? 'لا توجد أصناف تطابق البحث.' : 'لا توجد منتجات نهائية أو باندلات نشطة ضمن النطاق.'}</TableCell></TableRow>}
                {sorted.map(row => <TableRow key={row.key} data-performance-key={row.key}><TableCell className="print:break-all"><div className="font-medium">{itemLink(row) ? <Link className="underline underline-offset-4" to={itemLink(row)!}>{row.name}</Link> : row.name}</div><div className="text-xs text-muted-foreground"><span>{row.type === 'bundle' ? 'باندل' : 'منتج نهائي'}</span><span dir="ltr" className="block break-all">{row.code}</span></div>{row.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>)}</TableCell><TableCell dir="ltr">{money(row.unitCost)}</TableCell><TableCell dir="ltr">{money(row.salesPrice)}</TableCell><TableCell dir="ltr">{row.marginPercent === null ? 'غير متاح' : number(new Decimal(row.marginPercent).toDecimalPlaces(4).toString()) + '%'}</TableCell><TableCell dir="ltr">{number(row.quantity)}</TableCell><TableCell dir="ltr">{number(row.totalSold)}</TableCell><TableCell dir="ltr">{money(row.totalRevenue)}</TableCell><TableCell className="print:hidden"><Button variant="outline" size="sm" aria-label={'تفاصيل '+row.name} onClick={() => setSelectedKey(row.key)}>المصادر</Button></TableCell></TableRow>)}
                </TableBody></Table></CardContent></Card>
            </>}
        </CatalogReadState>
        <Dialog open={!!selectedKey} onOpenChange={open => { if (!open) setSelectedKey(null); }}><DialogContent task className="sm:max-w-4xl"><DialogHeader><DialogTitle>مصادر {selected?.name ?? 'الصنف'}</DialogTitle><DialogDescription>بنود البيع المنشورة، وتكوين الباندل عند انطباقه. فتح الفاتورة يعرض تفاصيلها الأصلية.</DialogDescription></DialogHeader>{selected && <div className="space-y-4">
            {selected.type === 'bundle' && <section className="space-y-2"><h3 className="font-semibold">المكونات الحالية للباندل</h3>{!selected.components.length && <p>لا توجد مكونات مسجلة؛ التكلفة الحالية المحسوبة صفر.</p>}{selected.components.map(component => <p key={component.id} className="text-sm">{performanceComponent(component)?.name ?? 'مكوّن غير متاح'} · الكمية {number(component.quantity === null ? null : String(component.quantity))} · تكلفة الوحدة {money(performanceComponent(component)?.unit_cost === null || performanceComponent(component)?.unit_cost === undefined ? null : String(performanceComponent(component)!.unit_cost))}</p>)}</section>}
            <h3 className="font-semibold">بنود البيع المنشورة ({selected.sales.length})</h3>{!selected.sales.length ? <p>لا توجد بنود بيع منشورة لهذا الصنف.</p> : <Table><TableHeader><TableRow><TableHead>الفاتورة</TableHead><TableHead>التاريخ</TableHead><TableHead>الكمية</TableHead><TableHead>سعر البند</TableHead></TableRow></TableHeader><TableBody>{selected.sales.map(sale => <TableRow key={sale.id}><TableCell><Link className="underline" to={'/commercial/selling/'+sale.invoice_id}>{sale.sales_invoices.invoice_number}</Link></TableCell><TableCell>{sale.sales_invoices.transaction_date}</TableCell><TableCell dir="ltr">{number(sale.quantity === null ? null : String(sale.quantity))}</TableCell><TableCell dir="ltr">{money(sale.unit_price === null ? null : String(sale.unit_price))}</TableCell></TableRow>)}</TableBody></Table>}
        </div>}</DialogContent></Dialog>
    </div>;
}




