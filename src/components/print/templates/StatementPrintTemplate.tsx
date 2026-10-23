import { forwardRef } from 'react';
import { statementMoney, balanceDirection, statementLabel, type StatementResult } from '@/features/parties/party-statement';
interface PartyInfo {
    name: string;
    type: 'customer' | 'supplier';
    phone?: string | null;
    address?: string | null;
}
export interface StatementData {
    party: PartyInfo;
    statement: StatementResult;
}
const StatementPrintTemplate = forwardRef<HTMLDivElement, {
    data: StatementData;
}>(({ data }, ref) => {
    const s = data.statement;
    return <div ref={ref} dir="rtl" className="bg-white text-black space-y-5 text-sm">
    <div className="border-b-2 border-black pb-4"><p>DELIGHT FACTORY</p><h1 className="text-2xl font-bold">كشف حساب {data.party.type === 'customer' ? 'عميل' : 'مورد'}</h1><h2 className="text-lg font-semibold">{data.party.name}</h2>{data.party.phone && <p>{data.party.phone}</p>}{data.party.address && <p>{data.party.address}</p>}<p>الفترة: {s.period.from || 'من بداية الحركات'} — {s.period.to || 'حتى أحدث حركة'} · عدد الحركات: {s.rows.length}</p><p>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p></div>
    <p>الكشف مرتب من الأقدم. الموجب مستحق لنا، والسالب مستحق للطرف.</p><p>رصيد الحركات السابق للفترة: {statementMoney(s.broughtForward)} ج.م</p>
    <table className="w-full border-collapse"><thead><tr>{['التاريخ', 'الحركة والبيان', 'مدين', 'دائن', 'رصيد الحركات'].map(label => <th key={label} className="border p-2 text-right">{label}</th>)}</tr></thead><tbody>{s.rows.map(row => <tr key={row.id}><td className="border p-2 whitespace-nowrap">{row.transaction_date}</td><td className="border p-2 break-words">{statementLabel(row)}<br />{row.description}</td><td className="border p-2">{statementMoney(row.debit)}</td><td className="border p-2">{statementMoney(row.credit)}</td><td className="border p-2">{statementMoney(row.runningBalance)}</td></tr>)}</tbody></table>
    {!s.rows.length && <p>لا توجد حركات في الفترة المختارة.</p>}
    <p>مجموع المدين: {statementMoney(s.debit)} · مجموع الدائن: {statementMoney(s.credit)} ج.م</p><p className="font-bold">رصيد الحركات في نهاية الفترة: {statementMoney(s.closing)} ج.م</p>
    <div className="border-t pt-3"><p>الرصيد الحالي المسجل: {statementMoney(s.recordedBalance)} ج.م ({balanceDirection(s.recordedBalance)})</p><p>صافي جميع الحركات المسجلة: {statementMoney(s.ledgerNet)} ج.م</p><p>الفرق بين الرصيد والحركات: {statementMoney(s.difference)} ج.م</p><p>{s.matches ? 'الرصيد الحالي يطابق صافي الحركات المقروءة.' : 'الفرق قد يشمل رصيدًا افتتاحيًا أو تعديلات قديمة أو فجوات تسجيل؛ لا يُعد رصيدًا افتتاحيًا موثقًا.'}</p><p>الكشف مشتق من المستندات المعتمدة والحركات النقدية الحالية، ولا يمثل سجلًا تاريخيًا ثابتًا للعمليات الملغاة.</p></div><div className="flex justify-around pt-8"><span>المحاسب: ______________</span><span>المراجعة: ______________</span></div>
    </div>;
});
StatementPrintTemplate.displayName = 'StatementPrintTemplate';
export default StatementPrintTemplate;
