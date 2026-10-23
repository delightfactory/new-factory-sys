import { useState } from 'react';
import { toast } from 'sonner';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TreasuriesService } from '@/services/TreasuriesService';
import { useAuth } from '@/contexts/AuthContext';
import { buildTreasuryStatement, treasuryCurrency, cashCategory, cashDirection, cashInvoiceHref, type CashEntry } from '@/features/treasuries/treasury-statement';
import { statementMoney } from '@/features/parties/party-statement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrintButton } from '@/components/print/PrintLayout';
import { FinancialReversalDialog } from '@/components/financial/FinancialReversalDialog';
import TreasuryStatementPrint from '@/components/print/templates/TreasuryStatementPrint';

function CashMovement({ row }: { row: CashEntry }) {
    const href = cashInvoiceHref(row);
    return <div className="min-w-0 space-y-1"><p className="font-medium">{cashCategory(row.category)}</p><p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{row.description || 'بدون بيان'}</p>{row.party_id && <Link className="block text-sm underline" to={`/commercial/parties/${row.party_id}`}>{row.party?.name || 'عرض الطرف'}</Link>}{href && <Link className="block text-sm underline" to={href}>عرض الفاتورة المرتبطة</Link>}</div>;
}
export default function TreasuryDetails() {
    const { id } = useParams(), valid = !!id && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
    const [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(0), [selected, setSelected] = useState<CashEntry | null>(null);
    const { hasRole } = useAuth(), client = useQueryClient();
    const query = useQuery({ queryKey: ['treasury-workspace', id], queryFn: () => TreasuriesService.getStatement(Number(id)), enabled: valid, retry: false, refetchOnWindowFocus: false });
    if (!valid) return <p role="alert">رابط الخزنة غير صحيح. <Link to="/commercial/treasuries">العودة للخزن</Link></p>;
    if (query.isPending || query.isFetching) return <p role="status">جارٍ تحميل الخزنة وكامل حركاتها…</p>;
    if (query.isError || !query.data) return <div role="alert" className="space-y-3 rounded-lg border p-5"><p>تعذر تحميل الخزنة وكشفها كاملًا. لم نعرض أرصدة أو مجاميع جزئية.</p><Button onClick={() => void query.refetch()}>إعادة المحاولة</Button><Button variant="outline" asChild><Link to="/commercial/treasuries">العودة للخزن</Link></Button></div>;
    const { treasury, entries } = query.data;
    const currency = treasuryCurrency(treasury.currency);
    let summary, statement, periodError = false;
    try { summary = buildTreasuryStatement(entries, treasury.balance); } catch { summary = null; }
    try { statement = buildTreasuryStatement(entries, treasury.balance, { from, to }); } catch (error) { statement = null; periodError = error instanceof Error && error.message === 'CASH_PERIOD_INVALID'; }
    const rows = statement?.rows ?? entries, currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1)), start = currentPage * 50;
    const visible = rows.slice().reverse().slice(start, start + 50);
    const canReverse = hasRole(['admin', 'manager', 'accountant']);
    const afterReversal = () => {
        setSelected(null);
        toast.success('أُلغيت الحركة وأُعيد أثرها على الأرصدة وحُذفت من الكشف الجاري.');
        for (const key of ['treasury-workspace', 'treasury', 'treasury-transactions', 'treasuries', 'financial_transactions', 'financial-reversal', 'party-workspace', 'parties', 'unpaid_invoices', 'invoice', 'sales_invoices', 'purchase_invoices', 'dashboard-stats']) void client.invalidateQueries({ queryKey: [key] });
    };
    return <div className="min-w-0 space-y-6">
      <div className="print:hidden space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><Link className="text-sm underline text-muted-foreground" to="/commercial/treasuries">الخزن والبنوك</Link><h1 className="mt-2 text-2xl font-bold break-words">كشف {treasury.name}</h1><p className="text-sm text-muted-foreground">{treasury.type === 'bank' ? 'حساب بنكي' : 'خزنة نقدية'} · {entries.length} حركة مسجلة</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void query.refetch()}>تحديث الكشف</Button>{statement && <PrintButton label="طباعة الكشف"/>}</div></header>
        {summary ? <section aria-label="مطابقة رصيد الخزنة" className="rounded-xl border bg-card p-5"><dl className="grid gap-4 sm:grid-cols-3">{[['الرصيد الحالي المسجل', summary.recorded], ['صافي جميع الحركات', summary.net], ['الفرق بين الرصيد والحركات', summary.difference]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold break-words">{statementMoney(value)} <span className="text-sm">{currency}</span></dd></div>)}</dl><p className="mt-4 border-t pt-3 text-sm text-muted-foreground">الفرق قد يشمل رصيدًا افتتاحيًا أو تعديلات قديمة أو فجوات تسجيل؛ لا نعتبره رصيدًا افتتاحيًا موثقًا. الوارد والصادر حركات نقدية تشمل التحويلات. القراءة ليست لقطة واحدة؛ إذا سُجلت حركة أثناء التحميل فقد يظهر فرق مؤقت، فحدّث الكشف.</p></section> : <p role="alert" className="rounded-lg border border-destructive p-4">تعذر حساب الكشف؛ هناك حركة تحتاج مراجعة اتجاهها أو مبلغها. أوقفنا المجاميع والطباعة حتى المراجعة، وتظهر الحركات المقروءة أدناه دون فلترة.</p>}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4"><label className="flex-1 min-w-0 space-y-1">من تاريخ<Input aria-label="كشف الخزنة من تاريخ" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }}/></label><label className="flex-1 min-w-0 space-y-1">إلى تاريخ<Input aria-label="كشف الخزنة إلى تاريخ" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }}/></label><Button variant="outline" onClick={() => { setFrom(''); setTo(''); setPage(0); }}>كل الفترة</Button></div>
        {periodError && <p role="alert" className="text-destructive">راجع الفترة: تاريخ البداية يجب أن يسبق تاريخ النهاية. تظهر الحركات أدناه دون فلترة حتى تصحيح الفترة.</p>}
        {statement && <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['رصيد الحركات السابق للفترة', statement.broughtForward], ['وارد الفترة', statement.incoming], ['صادر الفترة', statement.outgoing], ['رصيد الحركات بنهاية الفترة', statement.closing]].map(([label, value]) => <div key={label} className="border rounded-lg p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-lg font-semibold break-words">{statementMoney(value)}</dd></div>)}</dl>}
        <section className="rounded-xl border bg-card p-4 space-y-3"><h2 className="text-lg font-semibold">الحركات ({rows.length})</h2><p className="text-sm text-muted-foreground">الأحدث أولًا. الرصيد المتراكم محسوب من الأقدم، ويخص الحركات وحدها.</p><div className="hidden md:block"><table className="w-full text-sm"><thead><tr className="border-b">{['التاريخ', 'الحركة والبيان', 'الاتجاه', 'المبلغ', 'رصيد الحركات', 'المراجعة'].map(label => <th key={label} className="text-right p-3">{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.id} className="border-b"><td className="p-3 whitespace-nowrap">{row.transaction_date}</td><td className="p-3 max-w-sm"><CashMovement row={row}/></td><td className="p-3">{cashDirection(row) === 'in' ? 'وارد' : cashDirection(row) === 'out' ? 'صادر' : 'يحتاج مراجعة'}</td><td className="p-3">{Number.isFinite(Number(row.amount)) ? statementMoney(row.amount) : 'مبلغ غير صالح'}</td><td className="p-3">{'runningBalance' in row ? statementMoney(String(row.runningBalance)) : '—'}</td><td className="p-3">{canReverse && <Button variant="outline" size="sm" onClick={() => setSelected(row)}>مراجعة الإلغاء</Button>}</td></tr>)}</tbody></table></div>
        <div className="md:hidden divide-y">{visible.map(row => <article key={row.id} className="space-y-3 py-4"><time className="text-xs text-muted-foreground">{row.transaction_date}</time><CashMovement row={row}/><p>{cashDirection(row) === 'in' ? 'وارد' : cashDirection(row) === 'out' ? 'صادر' : 'اتجاه يحتاج مراجعة'} · {Number.isFinite(Number(row.amount)) ? statementMoney(row.amount) : 'مبلغ غير صالح'} {currency}</p>{'runningBalance' in row && <p>رصيد الحركات: {statementMoney(String(row.runningBalance))}</p>}{canReverse && <Button variant="outline" onClick={() => setSelected(row)}>مراجعة الإلغاء</Button>}</article>)}</div>{!rows.length && <p className="py-6 text-muted-foreground">{entries.length ? 'لا توجد حركات في الفترة المختارة.' : 'لا توجد حركات مسجلة لهذه الخزنة.'}</p>}</section>
        {rows.length > 0 && <div className="flex flex-wrap justify-between items-center gap-3"><p>عرض {start + 1}–{Math.min(start + 50, rows.length)} من {rows.length}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button><Button variant="outline" disabled={start + 50 >= rows.length} onClick={() => setPage(currentPage + 1)}>التالي</Button></div></div>}
        <p className="text-xs text-muted-foreground">الكشف يعرض السجل الجاري؛ الحركات الملغاة قد تُحذف منه بعد إعادة أثرها على الأرصدة، مع حفظ دليلها في سجل التدقيق.</p>
      </div>
      {statement && <div className="hidden print:block"><TreasuryStatementPrint name={treasury.name} currency={currency} statement={statement}/></div>}
      {selected && <FinancialReversalDialog key={selected.id} transactionId={selected.id} context={{ treasury: treasury.name, currency, row: selected }} onClose={() => setSelected(null)} onSuccess={afterReversal}/>}
    </div>;
}
