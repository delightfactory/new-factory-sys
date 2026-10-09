// Supporting React route draft. Integrator provides the EXISTING native
// Supabase client and approved app origin; no secrets or new account creation.
import { useEffect, useState } from 'react';
import { mcpAccessIsCurrent, mcpAccessExpiryLabel } from '@/lib/mcp-access-expiry';
import type { SupabaseClient } from '@supabase/supabase-js';
type Admission={authorization_id:string;user_id:string;client_id:string;redirect_uri:string;
 scope:string;resource:string;role:string;can_write:boolean;expires_at:string;fingerprint:string};
type Details={authorization_id:string;redirect_url?:string;scope:string;client:{id:string;name?:string};user:{id:string}};
type Request={admission:Admission;details?:Details;redirect?:string};
function callback(raw:string,expected:string){
 const a=new URL(raw),b=new URL(expected);
 if(a.protocol!=='https:'||b.protocol!=='https:'||a.username||a.password||a.hash||b.search||b.hash||b.username||b.password||a.origin!==b.origin||a.pathname!==b.pathname)
  throw Error('Callback mismatch');
 return a.href;
}
function bind(d:Details,a:Admission){
 if(d.authorization_id!==a.authorization_id||d.user.id!==a.user_id||d.client.id!==a.client_id||d.scope!==a.scope)
  throw Error('Authorization mismatch');
 if(d.redirect_url)callback(d.redirect_url,a.redirect_uri);
}
function same(a:Admission,b:Admission){
 return ['authorization_id','user_id','client_id','redirect_uri','scope','resource','role','can_write','expires_at','fingerprint']
  .every(key=>a[key as keyof Admission]===b[key as keyof Admission]);
}
export function FactoryOAuthConsent({supabase,appOrigin}:{supabase:SupabaseClient;appOrigin:string}){
 const params=new URLSearchParams(window.location.search);
 const authorizationId=params.get('authorization_id')||'';
 const [request,setRequest]=useState<Request|null>(null),[checked,setChecked]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load():Promise<Request>{
  if(window.location.origin!==appOrigin||!/^https:\/\//.test(appOrigin)||!/^[A-Za-z0-9_-]{1,128}$/.test(authorizationId)||params.getAll('authorization_id').length!==1)
   throw Error('Configuration');
  const actor=await supabase.auth.getUser(); if(actor.error||!actor.data.user)throw Error('Sign in');
  // Provider details may return an already-authorized callback. Still do not
  // navigate until an explicit user click and server-side admission checks.
  const provider=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if(provider.error||!provider.data)throw Error('Provider unavailable');
  const result=await supabase.rpc('factory_mcp_consent_request',{request_id:authorizationId});
  if(result.error||!result.data)throw Error('Admission unavailable');
  const admission=result.data as Admission;
  if(admission.authorization_id!==authorizationId||admission.user_id!==actor.data.user.id||!['openid','email','offline_access'].includes(admission.scope.split(' ')[0])||
   !admission.scope.split(' ').includes('openid')||!admission.scope.split(' ').every(x=>['openid','email','offline_access'].includes(x))||!mcpAccessIsCurrent(admission.expires_at))throw Error('Forbidden');
  const raw:unknown=provider.data;
  // Provider versions may return only a callback for an existing consent.
  // The native actor and complete provider request remain bound by the SQL gate.
  if(raw&&typeof raw==='object'&&!('authorization_id' in raw)&&'redirect_url' in raw&&typeof raw.redirect_url==='string')
   return {admission,redirect:callback(raw.redirect_url,admission.redirect_uri)};
  const details:Details=provider.data;
  if(!details.client||!details.user)throw Error('Authorization unavailable');
  bind(details,admission);
  return {admission,details,redirect:details.redirect_url?callback(details.redirect_url,admission.redirect_uri):undefined};
 }
 useEffect(()=>{let active=true;setChecked(false);setRequest(null);setError('');
  void load().then(value=>{if(active)setRequest(value);}).catch(()=>{if(active)setError('تعذر فتح طلب الربط. سجّل دخولك بحساب المصنع وتحقق من اعتماد العميل ومدة الوصول، ثم أعد فتح الربط.');});
  return()=>{active=false;};
 },[authorizationId,supabase,appOrigin]);
 async function decide(approve:boolean){
  if(busy||!request||(approve&&!checked))return;
  setBusy(true);setError('');
  try{
   const latest=await load();if(!same(latest.admission,request.admission))throw Error('Changed request');
   if(approve){
    const admitted=await supabase.rpc('factory_mcp_consent_admit',{request_id:authorizationId});
    if(admitted.error||!admitted.data||!same(admitted.data as Admission,latest.admission))throw Error('Admission rejected');
    if(latest.redirect){window.location.assign(callback(latest.redirect,latest.admission.redirect_uri));return;}
   }
   const response=approve
    ?await supabase.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true})
    :await supabase.auth.oauth.denyAuthorization(authorizationId,{skipBrowserRedirect:true});
   if(response.error||!response.data)throw Error('Provider decision unavailable');
   window.location.assign(callback(response.data.redirect_url,latest.admission.redirect_uri));
  }catch{setError('تعذر تأكيد نتيجة الربط. قد يكون القرار محفوظًا؛ أعد فتح الربط من ChatGPT للتحقق.');}
  finally{setBusy(false);}
 }

 const roleNames:Record<string,string>={admin:'مدير النظام',manager:'مدير',accountant:'محاسب',production_officer:'مسؤول الإنتاج',inventory_officer:'مسؤول المخزون',viewer:'مشاهد'};
 return <main dir="rtl" className="mx-auto max-w-2xl space-y-5 rounded-xl border bg-card p-5 sm:p-8">
  <a href="/" className="text-primary underline">العودة إلى المصنع</a>
  <h1 className="text-2xl font-semibold">ربط ChatGPT بنظام المصنع</h1>
  {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
  {!request&&!error&&<p role="status">جارٍ التحقق من طلب الربط…</p>}
  {request&&<>
   <p>التطبيق: <strong>{request.details?.client.name||'ChatGPT'}</strong></p>
   <p>صلاحياتك: {roleNames[request.admission.role]||'غير متاحة'}</p>
   <p>{request.admission.can_write?'سيستطيع قراءة بيانات المصنع وتسجيل العمليات التي تسمح بها صلاحياتك.':'سيستطيع قراءة بيانات المصنع التي تسمح بها صلاحياتك.'}</p>
   <p>تسجيل القبض والصرف يحفظ العملية في حسابات المصنع. لا يُجري تحويلًا مصرفيًا.</p>
   <p>ينتهي الوصول: <time dateTime={request.admission.expires_at === 'infinity' ? undefined : request.admission.expires_at}>{mcpAccessExpiryLabel(request.admission.expires_at)}</time></p>
   <details className="rounded-lg border p-3"><summary className="cursor-pointer">تفاصيل الاتصال</summary>
    <p className="mt-3">وجهة العودة: <span dir="ltr" className="break-all">{request.admission.redirect_uri}</span></p>
    <p>النظام: <span dir="ltr" className="break-all">{request.admission.resource}</span></p>
   </details>
   <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>أوافق على ربط حسابي بهذه الصلاحيات حتى الموعد الموضح.</label>
   <div className="flex flex-wrap gap-3">
    <button className="rounded-md bg-primary px-5 py-2 text-primary-foreground disabled:opacity-50" disabled={busy||!checked} onClick={()=>void decide(true)}>{busy?'جارٍ معالجة الطلب…':'الموافقة والربط'}</button>
    <button className="rounded-md border px-5 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void decide(false)}>رفض الربط</button>
   </div>
  </>}
 </main>;
}
