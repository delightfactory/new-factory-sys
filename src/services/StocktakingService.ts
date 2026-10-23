import { factoryCommand, fields } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";
import { readCompleteRows } from '@/platform/data/read-complete-rows';
import { executeStocktakeIntent, readStocktakeIntent, type StocktakeIntent } from '@/features/stocktaking/pending-count-intent';

async function stocktakeCommand(action:StocktakeIntent['action'],payload:Record<string,unknown>) {
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user)throw Error('سجّل الدخول لإتمام العملية.');
    await executeStocktakeIntent({storage:sessionStorage,actor:session.user.id,id:Number(payload.id),action:action,payload:payload,send:async intent=>{await factoryCommand(intent.action,intent.payload,intent.requestId);}});
}

export interface InventorySession {
    id: number;
    code: string;
    date: string;
    type: 'full' | 'partial';
    status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
    notes?: string;
    created_at: string;
}

export interface InventoryCountItem {
    id: number;
    session_id: number;
    item_type: 'raw_material' | 'packaging_material' | 'semi_finished' | 'finished_product';
    item_id: number;
    product_name: string;
    unit: string;
    system_quantity: number;
    counted_quantity: number;
    difference: number;
    unit_cost: number;
}

export const StocktakingService = {
    resumePending: async (id:number) => {
        const {data:{session}}=await supabase.auth.getSession();
        if(!session?.user)throw Error('سجّل الدخول لإتمام العملية.');
        const intent=readStocktakeIntent(sessionStorage,session.user.id,id);
        if(intent)await stocktakeCommand(intent.action,intent.payload);
    },
    // 1. Get Sessions
    getSessions: async () => {
        return readCompleteRows<InventorySession>(async (from, to) => {
        const { data, error, count } = await supabase
            .from('inventory_count_sessions')
            .select('*', {count:'exact'})
            .order('created_at', { ascending: false }).order('id', {ascending:false}).range(from,to);
        return {rows:data as InventorySession[]|null,error,count};
        }, 'STOCKTAKE_SESSIONS');
    },

    // 1.5 Get Single Session
    getSession: async (id: number) => {
        const { data, error } = await supabase
            .from('inventory_count_sessions')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data as InventorySession | null;
    },

    // 2. Create Session
    createSession: async (session: Partial<InventorySession>) => {
        return factoryCommand<InventorySession>("create_stocktake", fields(session, ["date", "type", "notes"]));
    },

    // 3. Generate Snapshot (Start Counting)
    startSession: async (sessionId: number, filters: { raw: boolean, packaging: boolean, semi: boolean, finished: boolean }) => {
        await stocktakeCommand("start_stocktake", { id: sessionId, ...filters });
    },

    // 4. Get Items for Session
    getSessionItems: async (sessionId: number) => {
        return readCompleteRows<InventoryCountItem>(async (from, to) => {
        const { data, error, count } = await supabase
            .from('inventory_count_items')
            .select('*', {count:'exact'})
            .eq('session_id', sessionId)
            .order('item_type')
            .order('product_name').order('id').range(from,to);
        return {rows:data as InventoryCountItem[]|null,error,count};
        }, 'STOCKTAKE_ITEMS');
    },

    // 5. Update Count
    recordCounts: async (sessionId: number, counts: {item_id:number;counted_quantity:number}[]) => {
        await stocktakeCommand('record_stocktake_counts', {id:sessionId, counts});
    },

    // 6. Reconcile (Finalize)
    reconcileSession: async (sessionId: number) => {
        await stocktakeCommand("reconcile_stocktake", { id: sessionId });
    },

    // 7. Cancel Session
    cancelSession: async (sessionId: number) => {
        await stocktakeCommand("cancel_stocktake", { id: sessionId });
    }
};
