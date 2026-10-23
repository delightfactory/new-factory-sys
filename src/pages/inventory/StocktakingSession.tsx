import { NumberInput } from '@/components/ui/number-input';
import { formatQuantity as displayQuantity } from '@/lib/number-format';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StocktakingService, type InventoryCountItem, type InventorySession } from '@/services/StocktakingService';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentExitGuard } from '@/hooks/use-document-exit-guard';
import { useConfirmation } from '@/hooks/use-confirmation';
import { countChanged, countDifference, countStatus, countUnitTotals, saveCountBatches, stockKind, validCount } from '@/features/stocktaking/count-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { readStocktakeIntent, type StocktakeIntent } from '@/features/stocktaking/pending-count-intent';

interface Props { sessionId: number; onBack: () => void }
export default function StocktakingSession({sessionId, onBack}: Props) {
    const [revision, setRevision] = useState(0);
    const query = useQuery({queryKey:['stocktake-workspace',sessionId], queryFn:async()=>{
        const session = await StocktakingService.getSession(sessionId);
        return session ? {session,items:await StocktakingService.getSessionItems(sessionId)} : null;
    },retry:false,refetchOnWindowFocus:false,gcTime:0});
    if (!query.data && query.isPending) return <p role="status">جارٍ تحميل الجلسة وكامل بنودها…</p>;
    if (!query.data && query.isError) return <div role="alert" className="space-y-3"><p>تعذر تحميل جلسة الجرد كاملة. لم نعرض ورقة عدّ جزئية.</p><Button onClick={()=>void query.refetch()}>إعادة المحاولة</Button><Button variant="outline" onClick={onBack}>العودة للجلسات</Button></div>;
    if (!query.data) return <p>جلسة الجرد غير موجودة. <Button variant="outline" onClick={onBack}>العودة للجلسات</Button></p>;
    return <CountSheet key={`${sessionId}:${revision}`} initial={query.data} onBack={onBack} reload={async()=>{const result=await query.refetch();if(result.isError)throw Error('تعذر تحميل النسخة الأحدث؛ بقيت الورقة الحالية.');setRevision(v=>v+1);}}/>;
}
function CountSheet({initial,onBack,reload}:{initial:{session:InventorySession;items:InventoryCountItem[]};onBack:()=>void;reload:()=>Promise<void>}) {
    const {session}=initial, {hasRole,user}=useAuth(), client=useQueryClient();
    const [baseline,setBaseline]=useState(initial.items), [edits,setEdits]=useState<Record<number,string>>({});
    const [search,setSearch]=useState(''),[onlyDifferences,setOnlyDifferences]=useState(false),[page,setPage]=useState(0);
    const [operation,setOperation]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState(''),[uncertain,setUncertain]=useState(false),[review,setReview]=useState(false),[postUncertain,setPostUncertain]=useState(false),[startUncertain,setStartUncertain]=useState(false);
    const [filters,setFilters]=useState({raw:true,packaging:true,semi:false,finished:false});
    function readJournal():{intent:StocktakeIntent|null;error:string} {try{return {intent:user?readStocktakeIntent(sessionStorage,user.id,session.id):null,error:''};}catch(cause){return {intent:null,error:cause instanceof Error?cause.message:'تعذر قراءة طلب الجرد المعلق.'};}}
    const [journal,setJournal]=useState(readJournal),[confirmedTransition,setConfirmedTransition]=useState('');
    const locked=!!journal.intent||!!journal.error;
    const busy=useRef(false), pending=!!operation, dirty=Object.keys(edits).length>0;
    const exit=useDocumentExitGuard(dirty||locked,pending||locked), confirmation=useConfirmation();
    const authorized=hasRole(['admin','manager','inventory_officer']), editable=authorized&&session.status==='in_progress'&&!locked&&!confirmedTransition;
    const value=(item:InventoryCountItem)=>edits[item.id]??String(item.counted_quantity);
    const invalid=baseline.filter(item=>!validCount(value(item)));
    const differences=baseline.filter(item=>{const diff=countDifference(value(item),item.system_quantity);return diff!==null&&Number(diff)!==0;});
    const filtered=baseline.filter(item=>(!onlyDifferences||differences.some(row=>row.id===item.id))&&`${item.product_name} ${stockKind(item.item_type)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/50)-1)),visible=filtered.slice(currentPage*50,currentPage*50+50);
    function change(item:InventoryCountItem,next:string) {if(!editable||pending||uncertain||postUncertain)return;setEdits(previous=>{const copy={...previous};if(countChanged(next,item.counted_quantity))copy[item.id]=next;else delete copy[item.id];return copy;});setError('');}
    async function perform(name:string,action:()=>Promise<void>) {
        if(busy.current)return;busy.current=true;setOperation(name);setError('');
        try {await action();} catch(cause) {setError(cause instanceof Error?cause.message:'تعذر تأكيد نتيجة العملية.');} finally {setJournal(readJournal());busy.current=false;setOperation('');}
    }
    async function save() {
        if(!editable||postUncertain||invalid.length||!dirty)return;
        await perform('save',async()=>{
            const changes=baseline.filter(item=>item.id in edits).map(item=>({item_id:item.id,counted_quantity:Number(edits[item.id])}));
            let confirmedCount=0;
            setProgress(`جارٍ حفظ ${changes.length} بندًا…`);
            try {await saveCountBatches(changes,batch=>StocktakingService.recordCounts(session.id,batch),(batch,done,total)=>{
                confirmedCount=done;
                const updated=new Map(batch.map(row=>[row.item_id,row.counted_quantity]));
                setBaseline(previous=>previous.map(item=>updated.has(item.id)?{...item,counted_quantity:updated.get(item.id)!,difference:Number(countDifference(String(updated.get(item.id)!),item.system_quantity))}:item));
                setEdits(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!updated.has(Number(id)))));
                setProgress(`تأكد حفظ ${done} من ${total} بندًا. كل دفعة مستقلة.`);
            });setUncertain(false);toast.success('تأكد حفظ جميع التعديلات.');}
            catch(cause) {const unresolved=!!readJournal().intent;setProgress(unresolved?`تأكد حفظ ${confirmedCount} من ${changes.length} بندًا؛ ${changes.length-confirmedCount} لم تتأكد نتيجتها بعد.`:`تأكد حفظ ${confirmedCount} من ${changes.length} بندًا؛ رُفضت الدفعة الحالية دون تطبيقها.`);setUncertain(unresolved);throw cause;}
        });
    }
    function refreshDependents() {for(const key of ['stocktakingSessions','stocktake-workspace','inventory','rawMaterials','packagingMaterials','semiFinishedProducts','finishedProducts','inventory-movements','inventory-movement','item','item-movements','report-inventory-valuation','inventory_turnover_report','inventory-analytics','financial-balance-sheet','report-low-stock-comprehensive','dashboard-stats','dashboard-balance-sheet'])void client.invalidateQueries({queryKey:[key]});}
    async function reconcile() {if(!editable||dirty||invalid.length||uncertain)return;await perform('post',async()=>{try{await StocktakingService.reconcileSession(session.id);}catch(cause){setPostUncertain(!!readJournal().intent);throw cause;}setPostUncertain(false);setConfirmedTransition('completed');setReview(false);refreshDependents();toast.success('اعتمد الجرد وأضيفت الفروق إلى المخزون الحالي.');await reload();});}
    async function cancel() {if(!authorized||pending||uncertain||postUncertain||startUncertain)return;if(!(await confirmation.ask({title:'إلغاء جلسة الجرد؟',description:'ستُلغى الجلسة دون تسوية المخزون. التعديلات غير المحفوظة ستُترك.',acceptLabel:'إلغاء الجرد'})))return;await perform('cancel',async()=>{await StocktakingService.cancelSession(session.id);setConfirmedTransition('cancelled');setEdits({});refreshDependents();exit.permitExit();await reload();});}
    async function recover() {if(!journal.intent)return;await perform('recover',async()=>{
        const intent=journal.intent!;await StocktakingService.resumePending(session.id);setUncertain(false);setStartUncertain(false);setPostUncertain(false);setJournal(readJournal());
        if(intent.action==='record_stocktake_counts') {const counts=intent.payload.counts as {item_id:number;counted_quantity:number}[],updated=new Map(counts.map(row=>[row.item_id,row.counted_quantity]));setBaseline(previous=>previous.map(item=>updated.has(item.id)?{...item,counted_quantity:updated.get(item.id)!,difference:Number(countDifference(String(updated.get(item.id)!),item.system_quantity))}:item));setEdits(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!updated.has(Number(id)))));setProgress('تأكد حفظ الدفعة المعلقة. احتفظنا بأي تعديلات لاحقة غير محفوظة.');}
        else {setReview(false);setConfirmedTransition(intent.action==='start_stocktake'?'in_progress':intent.action==='reconcile_stocktake'?'completed':'cancelled');setEdits({});refreshDependents();await reload();}
      });}
    const countInput=(item:InventoryCountItem)=><div><NumberInput aria-label={`العد الفعلي ${item.product_name}`} type="number" inputMode="decimal" min="0" max="1000000000000" step="any" value={value(item)} onChange={e=>change(item,e.target.value)} disabled={!editable||pending||uncertain||postUncertain} aria-invalid={!validCount(value(item))} className="font-semibold text-lg min-w-0"/>{!validCount(value(item))&&<p role="alert" className="text-xs text-destructive mt-1">أدخل عددًا صالحًا من صفر إلى تريليون ضمن الدقة المدعومة. الفراغ لا يعني صفرًا.</p>}</div>;
    return <div className="space-y-5 pb-28 min-w-0">
      {exit.confirmation}{confirmation.confirmation}
      <header className="flex flex-wrap justify-between items-start gap-3"><div><Button variant="ghost" disabled={pending||locked} onClick={async()=>{if(await exit.confirmDiscard())onBack();}}>العودة للجلسات</Button><h1 className="text-2xl font-bold break-words">ورقة الجرد {session.code}</h1><p>{countStatus(confirmedTransition||session.status)} · {session.date}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending||locked} onClick={async()=>{if(await exit.confirmReplacement())void perform('reload',reload);}}>تحميل النسخة الأحدث</Button>{authorized&&['draft','in_progress'].includes(session.status)&&<Button variant="outline" disabled={pending||locked||!!confirmedTransition||uncertain||postUncertain||startUncertain} onClick={()=>void cancel()}>إلغاء الجرد</Button>}</div></header>
      {session.notes&&<p className="whitespace-pre-wrap break-words">{session.notes}</p>}
      {error&&<div role="alert" className="border border-destructive rounded-lg p-4 space-y-2"><p>{error}</p>{uncertain&&<p>قد يكون الحفظ وصل إلى الخادم. احتفظنا بالقيم المتبقية وقفلنا التحرير والاعتماد؛ اضغط «تأكيد نتيجة الطلب المعلق» قبل أي تعديل أو تحميل جديد.</p>}</div>}
      {confirmedTransition&&<p role="status" className="rounded-lg border p-4">تأكدت العملية وحالة الجلسة أصبحت «{countStatus(confirmedTransition)}». الأوامر مقفلة حتى تحميل النسخة الأحدث.</p>}
      {locked&&<div role="alert" className="rounded-lg border border-amber-500 p-4 space-y-3"><p>{journal.error||'يوجد طلب لم تتأكد نتيجته. التحرير والتحميل والمغادرة مقفلة حتى تأكيد الطلب الأصلي؛ حتى إعادة فتح الصفحة تحتفظ به.'}</p>{journal.intent&&authorized&&<Button disabled={pending} onClick={()=>void recover()}>{operation==='recover'?'جارٍ تأكيد النتيجة…':'تأكيد نتيجة الطلب المعلق'}</Button>}</div>}
      {progress&&<p role="status" className="rounded-lg bg-muted p-3">{progress}</p>}
      {session.status==='draft'&&!confirmedTransition&&<section className="rounded-xl border p-5 space-y-4"><h2 className="font-semibold">اختيار أقسام الجرد وبدء العد</h2><p className="text-sm text-muted-foreground">المسودة محفوظة. فشل البدء يبقيها بنفس الرقم؛ أعد المحاولة هنا.</p><div className="flex flex-wrap gap-4">{([['raw','المواد الخام'],['packaging','مواد التعبئة'],['semi','نصف المصنع'],['finished','المنتجات النهائية']]as const).map(([key,label])=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={filters[key]} disabled={pending||locked||!authorized||startUncertain} onChange={e=>setFilters(previous=>({...previous,[key]:e.target.checked}))}/>{label}</label>)}</div>{authorized&&<Button disabled={pending||locked||!Object.values(filters).some(Boolean)} onClick={()=>void perform('start',async()=>{try{await StocktakingService.startSession(session.id,filters);}catch(cause){setStartUncertain(!!readJournal().intent);throw cause;}setStartUncertain(false);setConfirmedTransition('in_progress');refreshDependents();await reload();})}>{operation==='start'?'جارٍ بدء العد…':'بدء العد'}</Button>}</section>}
      {session.status!=='draft'&&<><div className="rounded-lg border p-4 text-sm space-y-2"><p>القيم المبدئية تساوي الرصيد الدفتري وقت البدء. النظام لا يسجل أي بند عُدّ فعليًا.</p><p>عند عمل أكثر من موظف على الجلسة نفسها، آخر حفظ هو المعتمد. نسّقوا العد قبل الحفظ. استرداد الطلب المعلق يخص هذا التبويب؛ لا ينتقل إلى تبويب أو جهاز آخر.</p><p>الأصناف: {baseline.length} · أصناف بها فروق: {differences.length} · تعديلات غير محفوظة: {Object.keys(edits).length}</p>{!editable&&<p>هذه الورقة للعرض فقط حسب حالة الجلسة وصلاحيات حسابك.</p>}</div>
      <div className="flex flex-wrap items-center gap-4"><Input aria-label="البحث في بنود الجرد" placeholder="ابحث باسم الصنف أو نوعه" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} className="sm:max-w-sm"/><label className="flex gap-2 items-center"><input type="checkbox" checked={onlyDifferences} onChange={e=>{setOnlyDifferences(e.target.checked);setPage(0);}}/>الفروق فقط</label></div>
      <div className="hidden md:block rounded-lg border"><table className="w-full text-sm"><thead><tr>{['الصنف','الوحدة','الدفتري وقت البدء','العد الفعلي','الفرق'].map(x=><th key={x} className="p-3 text-right">{x}</th>)}</tr></thead><tbody>{visible.map(item=><tr key={item.id} className="border-t"><td className="p-3"><p className="font-medium break-words">{item.product_name}</p><p className="text-xs text-muted-foreground">{stockKind(item.item_type)}</p></td><td className="p-3">{item.unit}</td><td className="p-3">{displayQuantity(item.system_quantity)}</td><td className="p-3 max-w-48">{countInput(item)}</td><td className="p-3 font-semibold" dir="ltr">{countDifference(value(item),item.system_quantity)===null?'—':displayQuantity(countDifference(value(item),item.system_quantity))}</td></tr>)}</tbody></table></div>
      <div className="md:hidden divide-y rounded-lg border px-4">{visible.map(item=><article key={item.id} className="py-4 space-y-3"><p className="font-semibold break-words">{item.product_name}</p><p className="text-xs text-muted-foreground">{stockKind(item.item_type)} · {item.unit}</p><p>الدفتري وقت البدء: {displayQuantity(item.system_quantity)} · الفرق: <span dir="ltr">{countDifference(value(item),item.system_quantity)===null?'—':displayQuantity(countDifference(value(item),item.system_quantity))}</span></p>{countInput(item)}</article>)}</div>
      {!filtered.length&&<p className="py-6 text-muted-foreground">{baseline.length?'لا توجد أصناف تطابق البحث والفلتر.':'لا توجد بنود في هذه الجلسة.'}</p>}
      {filtered.length>0&&<div className="flex flex-wrap justify-between gap-3 items-center"><p>عرض {currentPage*50+1}–{Math.min(currentPage*50+50,filtered.length)} من {filtered.length}</p><div className="flex gap-2"><Button variant="outline" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>السابق</Button><Button variant="outline" disabled={(currentPage+1)*50>=filtered.length} onClick={()=>setPage(currentPage+1)}>التالي</Button></div></div>}
      {editable&&<div className="sticky bottom-20 md:bottom-0 z-20 rounded-xl border bg-background p-3 shadow-lg flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{Object.keys(edits).length} تعديل غير محفوظ{invalid.length?` · ${invalid.length} قيمة غير صالحة`:''}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending||postUncertain||!dirty||invalid.length>0} onClick={()=>void save()}>{operation==='save'?'جارٍ الحفظ…':uncertain?'إعادة الحفظ بنفس البيانات':'حفظ التعديلات'}</Button><Button disabled={pending||dirty||uncertain||invalid.length>0||!baseline.length} onClick={()=>{setError('');setReview(true);}}>مراجعة الفروق والاعتماد</Button></div></div>}
      </>}
      <Dialog open={review} onOpenChange={open=>{if(!pending)setReview(open);}}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>مراجعة فروق الجرد قبل الاعتماد</DialogTitle><DialogDescription>الاعتماد يضيف الفرق (المعدود − الدفتري وقت البدء) إلى الرصيد الحالي. إذا تحرك المخزون بعد البدء فلن يساوي الرصيد النهائي العد المسجل. التكلفة لا تتغير، ولا يمكن التراجع عن الاعتماد.</DialogDescription></DialogHeader><p>{differences.length} صنفًا به فرق من {baseline.length}.</p>{countUnitTotals(differences.map(item=>({unit:item.unit,difference:countDifference(value(item),item.system_quantity)!}))).map(total=><p key={total.unit}>الوحدة {total.unit}: زيادة {displayQuantity(total.increase)} · عجز {displayQuantity(total.decrease)}</p>)}{postUncertain&&<p role="alert">لم تتأكد نتيجة الاعتماد. التحرير مقفول؛ اضغط «تأكيد نتيجة الطلب المعلق» لتأكيده قبل أي تعديل أو تحميل جديد.</p>}<div className="divide-y">{differences.map(item=><div key={item.id} className="py-3"><p className="font-semibold">{item.product_name} · {item.unit}</p><p>الدفتري: {displayQuantity(item.system_quantity)} · المعدود: {displayQuantity(value(item))} · الفرق: <span dir="ltr">{displayQuantity(countDifference(value(item),item.system_quantity))}</span></p></div>)}</div>{!differences.length&&<p>لا توجد فروق في القيم المسجلة. هذا لا يثبت أن كل بند عُدّ فعليًا.</p>}{error&&<p role="alert" className="text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-2">{journal.intent&&<Button disabled={pending} onClick={()=>void recover()}>تأكيد نتيجة الطلب المعلق</Button>}<Button variant="outline" disabled={pending} onClick={()=>setReview(false)}>العودة للورقة</Button><Button disabled={pending||locked||!!confirmedTransition||dirty||uncertain||!!invalid.length} onClick={()=>void reconcile()}>{operation==='post'?'جارٍ الاعتماد…':'اعتماد الجرد وتسوية المخزون'}</Button></div></DialogContent></Dialog>
    </div>;
}
