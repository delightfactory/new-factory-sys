import { isDefinitiveCommandFailure } from '../../platform/data/command-failure.ts';
export interface StocktakeIntent { action: 'start_stocktake'|'record_stocktake_counts'|'reconcile_stocktake'|'cancel_stocktake'; payload: Record<string,unknown>; requestId: string }
export interface IntentStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void }
const key=(actor:string,id:number)=>`factory-stocktake-pending:${actor}:${id}`;
export function readStocktakeIntent(storage:IntentStorage,actor:string,id:number):StocktakeIntent|null {
    try {
        const raw=storage.getItem(key(actor,id));if(!raw)return null;
        const intent=JSON.parse(raw) as StocktakeIntent;
        if(!intent||!['start_stocktake','record_stocktake_counts','reconcile_stocktake','cancel_stocktake'].includes(intent.action)||intent.payload?.id!==id||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(intent.requestId))throw Error('INVALID_INTENT');
        return intent;
    } catch {throw Error('تعذر قراءة طلب الجرد المعلق. احتفظ بهذه النافذة وراجع الدعم قبل أي تعديل.');}
}
interface IntentExecution { storage:IntentStorage;actor:string;id:number;action:StocktakeIntent['action'];payload:Record<string,unknown>;send:(intent:StocktakeIntent)=>Promise<void>;requestId?:string }
export async function executeStocktakeIntent({storage,actor,id,action,payload,send,requestId=crypto.randomUUID()}:IntentExecution) {
    const existing=readStocktakeIntent(storage,actor,id);
    if(existing&&(existing.action!==action||JSON.stringify(existing.payload)!==JSON.stringify(payload)))throw Error('يوجد طلب جرد لم تتأكد نتيجته. أكّد الطلب المعلق قبل أي عملية جديدة.');
    const intent=existing??{action,payload,requestId};
    // A tab-local recovery journal contains only this synthetic/user-entered
    // operation; no token, account password or unrelated document is stored.
    storage.setItem(key(actor,id),JSON.stringify(intent));
    try {await send(intent);storage.removeItem(key(actor,id));}
    catch(error) {if(isDefinitiveCommandFailure(error,!!existing))storage.removeItem(key(actor,id));throw error;}
}
