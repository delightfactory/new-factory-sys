import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PartyStatementService, type PartyInvoice } from '@/services/PartyStatementService';
import { buildStatement, statementMoney, balanceDirection, statementLabel, statementHref, type StatementRow } from '@/features/parties/party-statement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { PrintButton } from '@/components/print/PrintLayout';
import StatementPrintTemplate from '@/components/print/templates/StatementPrintTemplate';
const pageSize = 50;
function Movement({ row }: {
    row: StatementRow;
}) { const href = statementHref(row); return <><p className="font-medium">{href ? <Link className="underline underline-offset-4" to={href}>{statementLabel(row)}</Link> : statementLabel(row)}</p><p className="text-sm text-muted-foreground break-words whitespace-pre-wrap">{row.description || 'بدون بيان'}</p></>; }
function StatementRows({ rows }: {
    rows: StatementRow[];
}) { return <><div className="hidden md:block"><Table><TableHeader><TableRow>{['التاريخ', 'الحركة والبيان', 'مدين', 'دائن', 'رصيد الحركات'].map(x => <TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}><TableCell className="whitespace-nowrap" dir="ltr">{row.transaction_date}</TableCell><TableCell className="max-w-sm"><Movement row={row}/></TableCell><TableCell>{statementMoney(row.debit)}</TableCell><TableCell>{statementMoney(row.credit)}</TableCell><TableCell className="font-semibold">{statementMoney(row.runningBalance)}</TableCell></TableRow>)}</TableBody></Table></div><div className="md:hidden divide-y">{rows.map(row => <article key={row.id} className="py-4 space-y-3"><time className="text-xs text-muted-foreground">{row.transaction_date}</time><Movement row={row}/><dl className="grid grid-cols-3 gap-2 text-sm">{[['مدين', row.debit], ['دائن', row.credit], ['رصيد الحركات', row.runningBalance]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold break-words">{statementMoney(value)}</dd></div>)}</dl></article>)}</div></>; }
function InvoiceRows({ invoices, sale }: {
    invoices: PartyInvoice[];
    sale: boolean;
}) { return <div className="divide-y">{invoices.map(i => <article key={i.id} className="py-3 flex flex-wrap items-center justify-between gap-3"><div><Link className="font-medium underline underline-offset-4 break-all" to={`/commercial/${sale ? 'selling' : 'buying'}/${i.id}`}>{i.invoice_number || 'عرض الفاتورة'}</Link><p className="text-sm text-muted-foreground">{i.transaction_date}</p></div><div className="text-sm"><Badge variant="outline">{i.status === 'posted' ? 'معتمدة' : i.status === 'void' ? 'ملغاة' : i.status === 'draft' ? 'مسودة' : 'حالة غير محددة'}</Badge><p>الإجمالي: {statementMoney(i.total_amount)} ج.م</p><p>{i.status === 'draft' ? 'الدفعة عند الاعتماد' : 'المدفوع'}: {statementMoney(i.paid_amount)} ج.م</p></div></article>)}</div>; }
export default function PartyDetails() {
    const { id } = useParams();
    const valid = !!id && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
    const [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(0), [tab, setTab] = useState('soa');
    const query = useQuery({ queryKey: ['party-workspace', id], queryFn: () => PartyStatementService.get(id!), enabled: valid, retry: false, refetchOnWindowFocus: false });
    if (!valid)
        return <div role="alert">رابط الطرف غير صحيح. <Link to="/commercial/parties">العودة للأطراف</Link></div>;
    if (query.isPending || query.isFetching)
        return <p role="status">جارٍ تحميل الطرف وكامل حركاته…</p>;
    if (query.isError)
        return <div role="alert" className="rounded-lg border border-destructive p-5 space-y-3"><p>تعذر تحميل بيانات الطرف وكشفه كاملًا. لم نعرض أرصدة أو حركات جزئية.</p><Button onClick={() => void query.refetch()}>إعادة المحاولة</Button><Button variant="outline" asChild><Link to="/commercial/parties">العودة للأطراف</Link></Button></div>;
    if (!query.data)
        return <p>الطرف غير موجود. <Link to="/commercial/parties">العودة للأطراف</Link></p>;
    const { party, entries, invoices } = query.data;
    let statement;
    try {
        statement = buildStatement(entries, party.balance, { from, to });
    }
    catch {
        statement = null;
    }
    const movements = statement?.rows ?? [], cash = entries.filter(row => row.id.startsWith('ft_')).map(row => ({ ...row, runningBalance: '0' }));
    const activeRows = tab === 'payments' ? cash : tab === 'invoices' ? invoices : movements;
    const currentPage = Math.min(page, Math.max(0, Math.ceil(activeRows.length / pageSize) - 1)), start = currentPage * pageSize;
    const visible = movements.slice().reverse().slice(start, start + pageSize), visibleCash = cash.slice().reverse().slice(start, start + pageSize), visibleInvoices = invoices.slice().reverse().slice(start, start + pageSize);
    const summary = buildStatement(entries, party.balance);
    return <div className="space-y-6 min-w-0">
      <div className="space-y-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><Link className="text-sm text-muted-foreground underline" to="/commercial/parties">العملاء والموردون</Link><h1 className="text-2xl font-bold break-words mt-2">{party.name}</h1><Badge variant="outline">{party.type === 'customer' ? 'عميل' : 'مورد'}</Badge>{party.phone && <p className="mt-2" dir="ltr">{party.phone}</p>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void query.refetch()}>تحديث الكشف</Button>{statement && <PrintButton label="طباعة الكشف"/>}<Button asChild><Link to={`/commercial/payments?party=${party.id}&type=${party.type === 'customer' ? 'income' : 'expense'}`}>{party.type === 'customer' ? 'تسجيل تحصيل' : 'تسجيل سداد'}</Link></Button></div></div>
        <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">بيانات الاتصال</summary><p className="mt-2 break-words">البريد: {party.email || 'غير محدد'}</p><p className="break-words">العنوان: {party.address || 'غير محدد'}</p></details>
        <section aria-label="مطابقة رصيد الطرف" className="rounded-xl border bg-card p-4 md:p-6"><dl className="grid gap-5 sm:grid-cols-3">{[['الرصيد الحالي المسجل', summary.recordedBalance], ['صافي جميع الحركات المسجلة', summary.ledgerNet], ['الفرق بين الرصيد والحركات', summary.difference]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold mt-1 break-words">{statementMoney(value)} <span className="text-sm font-normal">ج.م</span></dd></div>)}</dl><p className="mt-3 text-sm">{balanceDirection(summary.recordedBalance)}</p><p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{summary.matches ? 'الرصيد الحالي يطابق صافي الحركات المقروءة.' : 'يوجد فرق يحتاج مراجعة؛ قد يشمل رصيدًا افتتاحيًا أو تعديلات قديمة أو فجوات تسجيل. لا نعتبره رصيدًا افتتاحيًا موثقًا.'}</p></section>
        <Tabs value={tab} onValueChange={v => { setTab(v); setPage(0); }}><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="soa">كشف الحساب</TabsTrigger><TabsTrigger value="invoices">الفواتير ({invoices.length})</TabsTrigger><TabsTrigger value="payments">النقدية ({cash.length})</TabsTrigger></TabsList>
          <TabsContent value="soa" className="space-y-4"><div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"><label className="space-y-1 flex-1 min-w-0">من تاريخ<Input aria-label="الكشف من تاريخ" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }}/></label><label className="space-y-1 flex-1 min-w-0">إلى تاريخ<Input aria-label="الكشف إلى تاريخ" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }}/></label><Button variant="outline" onClick={() => { setFrom(''); setTo(''); setPage(0); }}>كل الفترة</Button></div>
          {!statement ? <p role="alert" className="text-destructive">راجع الفترة: تاريخ البداية يجب أن يسبق تاريخ النهاية.</p> : <><dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['رصيد الحركات السابق للفترة', statement.broughtForward], ['مدين الفترة', statement.debit], ['دائن الفترة', statement.credit], ['رصيد الحركات في نهاية الفترة', statement.closing]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold break-words">{statementMoney(value)}</dd></div>)}</dl><p className="text-sm text-muted-foreground">الأحدث أولًا. الرصيد المتراكم محسوب بترتيب الحركات من الأقدم. الفلاتر تخص الحركات ولا تغيّر الرصيد الحالي المسجل. الموجب مستحق لنا، والسالب مستحق للطرف.</p><Card><CardHeader><CardTitle>حركات الفترة ({movements.length})</CardTitle></CardHeader><CardContent>{movements.length ? <StatementRows rows={visible}/> : <p className="py-6 text-center text-muted-foreground">{entries.length ? 'لا توجد حركات في الفترة المختارة.' : 'لا توجد حركات مسجلة لهذا الطرف.'}</p>}</CardContent></Card><p className="text-xs text-muted-foreground">الكشف مشتق من المستندات المعتمدة والحركات النقدية الحالية، ولا يمثل سجلًا تاريخيًا ثابتًا للعمليات الملغاة.</p></>}
          </TabsContent><TabsContent value="invoices"><Card><CardHeader><CardTitle>جميع الفواتير</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">تظهر المسودات والمعتمدة والملغاة؛ كشف الحساب يتبع المستندات المعتمدة فقط.</p>{invoices.length ? <InvoiceRows invoices={visibleInvoices} sale={party.type === 'customer'}/> : <p className="py-6">لا توجد فواتير لهذا الطرف.</p>}</CardContent></Card></TabsContent>
          <TabsContent value="payments"><Card><CardHeader><CardTitle>الحركات النقدية ({cash.length})</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">كل الحركات النقدية بغض النظر عن فترة الكشف، ويشمل العكس إن وجد. تعرض القيم كما سجلها الدفتر.</p>{cash.length ? <div className="divide-y">{visibleCash.map(row => <article key={row.id} className="py-3 space-y-2"><time>{row.transaction_date}</time><Movement row={row}/><p>مدين: {statementMoney(row.debit)} · دائن: {statementMoney(row.credit)} ج.م</p></article>)}</div> : <p className="py-6">لا توجد حركات نقدية لهذا الطرف.</p>}</CardContent></Card></TabsContent>
        </Tabs>
        {activeRows.length > 0 && (tab !== 'soa' || statement) && <div className="flex flex-wrap justify-between items-center gap-3"><p className="text-sm text-muted-foreground">عرض {start + 1}–{Math.min(start + pageSize, activeRows.length)} من {activeRows.length}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button><Button variant="outline" disabled={start + pageSize >= activeRows.length} onClick={() => setPage(currentPage + 1)}>التالي</Button></div></div>}
      </div>
      {statement && <div className="hidden print:block"><StatementPrintTemplate data={{ party, statement }}/></div>}
    </div>;
}
