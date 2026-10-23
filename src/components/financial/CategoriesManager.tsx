import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {FinancialService} from '@/services/FinancialService';
import {readCategoryUsage} from '@/services/FinancialCategoryService';
import {type FinancialCategoryType,type FinancialCategory} from '@/features/financial/category-policy';
import {useConfirmation} from '@/hooks/use-confirmation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogTrigger,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';

function categoryError(error: unknown) {
 const issue=error as {message?:string;code?:string;databaseCode?:string};
 if(issue.code==='23505'||issue.databaseCode==='23505')return 'البند موجود بالفعل لهذا النوع.';
 if(issue.message?.includes('MCP_CATEGORY_IN_USE'))return 'البند مستخدم في حركات مالية؛ لا يمكن حذفه لأنه يؤثر في أرباح الفترات السابقة.';
 if(issue.message?.includes('MCP_CATEGORY_SYSTEM'))return 'هذا بند نظامي ولا يمكن حذفه.';
 return issue.message || 'تعذر إتمام العملية. احتُفظ بالبيانات لإعادة المحاولة.';
}
export function CategoriesManager() {
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[type,setType]=useState<FinancialCategoryType>('expense'),[confirming,setConfirming]=useState(false);
 const queryClient=useQueryClient(),{ask,confirmation}=useConfirmation();
 const categories=useQuery({queryKey:['financial_categories'],queryFn:()=>FinancialService.getCategories(),enabled:open,retry:false,refetchOnWindowFocus:false});
 const usage=useQuery({queryKey:['financial_category_usage'],queryFn:readCategoryUsage,enabled:open,retry:false,refetchOnWindowFocus:false});
 function refresh() {void queryClient.invalidateQueries();}
 const create=useMutation({mutationFn:(data:{name:string;type:FinancialCategoryType})=>FinancialService.createCategory(data),onSuccess:()=>{toast.success('تمت إضافة البند؛ أُعيد حساب التقارير وفق الإعداد الحالي.');setName('');refresh();}});
 const remove=useMutation({mutationFn:FinancialService.deleteCategory,onSuccess:()=>{toast.success('تم حذف البند غير المستخدم.');refresh();}});
 const busy=create.isPending||remove.isPending||confirming;
 const ready=!!categories.data&&!!usage.data&&!categories.isError&&!usage.isError&&!categories.isFetching&&!usage.isFetching;
 const selected=categories.data?.filter(c=>c.type===type)??[];
 const unconfigured=usage.data?.filter(row=>row.type===type&&!categories.data?.some(c=>c.type===type&&c.name===row.name))??[];
 async function add(value:string, preserveExactName=false) {
  const proposed=preserveExactName?value:value.trim();if(!ready||busy||!proposed.trim())return;
  if(categories.data!.some(c=>c.type===type&&c.name===proposed)){toast.error('البند موجود بالفعل لهذا النوع.');return;}
  const impact=usage.data!.find(row=>row.type===type&&row.name===proposed),data={name:proposed,type};
  setConfirming(true);
  try {if(await ask({title:'مراجعة أثر إضافة البند',description:`إضافة «${proposed}» كبند ${type==='expense'?'مصروف':'إيراد'} ${impact?`ستُدخل ${impact.count} حركة سابقة بقيمة ${impact.amount} ج.م في الأرباح والخسائر لكل الفترات.`:'لا تطابق حركات سابقة في القراءة الحالية.'} تُطبق قاعدة الاسم والنوع على الحركات الحالية واللاحقة؛ لن تُعدل أي حركة. القراءة ليست إقفالًا ثابتًا.`,acceptLabel:'إضافة البند واعتماد التصنيف',cancelLabel:'رجوع دون إضافة'}))create.mutate(data);} finally {setConfirming(false);}
 }
 async function deleteUnused(category:FinancialCategory) {
  if(!ready||busy||category.is_system||usage.data!.some(row=>row.type===category.type&&row.name===category.name))return;
  setConfirming(true);try {if(await ask({title:'حذف بند غير مستخدم',description:`سيُحذف «${category.name}» من خيارات ${category.type==='expense'?'المصروفات':'الإيرادات'}. لم تظهر حركات بهذا الاسم والنوع في القراءة الحالية؛ الخادم يراجع الاستخدام عند الحذف.`,acceptLabel:'حذف البند',cancelLabel:'الاحتفاظ بالبند'}))remove.mutate(category.id);}finally{setConfirming(false);}
 }
 return <><Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}><DialogTrigger asChild><Button variant="outline" size="sm">إدارة البنود</Button></DialogTrigger><DialogContent task className="sm:max-w-3xl"><DialogHeader><DialogTitle>بنود المصروفات والإيرادات</DialogTitle><DialogDescription>البند المعدّ يحدد إدراج الحركات في الأرباح والخسائر حسب الاسم والنوع لكل التاريخ. لا إعادة تسمية أو اعتماد تلقائي للحركات.</DialogDescription></DialogHeader>
 <div className="flex flex-wrap gap-2"><Button variant={type==='expense'?'default':'outline'} disabled={busy} onClick={()=>setType('expense')}>المصروفات</Button><Button variant={type==='income'?'default':'outline'} disabled={busy} onClick={()=>setType('income')}>الإيرادات</Button><Button variant="outline" disabled={busy||categories.isFetching||usage.isFetching} onClick={()=>{void categories.refetch();void usage.refetch();}}>تحديث البنود والاستخدام</Button></div>
 {(categories.isFetching||usage.isFetching)&&<p role="status">جارٍ قراءة البنود واستخدامها في جميع الحركات…</p>}
 {(categories.isError||usage.isError)&&<p role="alert">تعذر استكمال قراءة البنود أو استخداماتها. أُوقفت الإضافة والحذف حتى تعيد تحميلها.</p>}
 {create.isError&&<p role="alert" className="text-destructive">{categoryError(create.error)}</p>}{remove.isError&&<p role="alert" className="text-destructive">{categoryError(remove.error)}</p>}
 <form className="flex flex-wrap gap-2 items-end" onSubmit={event=>{event.preventDefault();void add(name);}}><label className="flex-1 min-w-0">اسم البند الجديد ({type==='expense'?'مصروف':'إيراد'})<Input value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="اكتب الاسم كما سيُسجل في السند"/></label><Button type="submit" disabled={!ready||busy||!name.trim()}>مراجعة الإضافة</Button></form>
 {ready&&<><h2 className="font-semibold">البنود المعدّة ({selected.length})</h2>{!selected.length?<p>لا توجد بنود معدّة لهذا النوع.</p>:<ul className="space-y-2">{selected.map(category=>{const history=usage.data!.find(row=>row.type===category.type&&row.name===category.name);return <li className="rounded-xl border p-3 flex flex-wrap justify-between gap-3 items-center" key={category.id}><div><p className="font-semibold break-all">{category.name}{category.is_system?' · نظامي':''}</p><p className="text-sm text-muted-foreground">{history?`${history.count} حركة تاريخية · ${history.amount} ج.م`:'غير مستخدم في الحركات الحالية'}</p>{history&&<p className="text-xs">حذفه يغيّر أرباح الفترات السابقة، لذلك لا يمكن حذفه.</p>}</div>{!category.is_system&&<Button variant="outline" disabled={busy||!!history} onClick={()=>void deleteUnused(category)}>حذف {category.name}</Button>}</li>;})}</ul>}
 <h2 className="font-semibold">أسماء مستخدمة في الحركات وغير معدّة ({unconfigured.length})</h2><p className="text-sm text-muted-foreground">هذه الحركات خارج الربح وفق القاعدة الحالية. تحصيل العميل وسداد المورد لهما أثر تسوية؛ إضافتهما كبنود ربح تحتاج مراجعة محاسبية.</p>{!unconfigured.length?<p>لا توجد أسماء غير معدّة لهذا النوع.</p>:<ul className="space-y-2">{unconfigured.map(row=><li key={row.name} className="rounded-xl border p-3 flex flex-wrap justify-between gap-3 items-center"><div><p className="font-semibold break-all"><bdi className="whitespace-pre-wrap">{row.name}</bdi></p><p className="text-sm">{row.count} حركة · <bdi>{row.amount}</bdi> ج.م</p></div><Button variant="outline" disabled={busy||!row.name.trim()} onClick={()=>void add(row.name,true)}>إضافة «{row.name}» كبند {type==='expense'?'مصروف':'إيراد'}</Button></li>)}</ul>}</>}
 </DialogContent></Dialog>{confirmation}</>;
}
