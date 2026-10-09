import { factoryCommand, fields } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";

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
    // 1. Get Sessions
    getSessions: async () => {
        const { data, error } = await supabase
            .from('inventory_count_sessions')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as InventorySession[];
    },

    // 1.5 Get Single Session
    getSession: async (id: number) => {
        const { data, error } = await supabase
            .from('inventory_count_sessions')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as InventorySession;
    },

    // 2. Create Session
    createSession: async (session: Partial<InventorySession>) => {
        return factoryCommand<InventorySession>("create_stocktake", fields(session, ["date", "type", "notes"]));
    },

    // 3. Generate Snapshot (Start Counting)
    startSession: async (sessionId: number, filters: { raw: boolean, packaging: boolean, semi: boolean, finished: boolean }) => {
        await factoryCommand("start_stocktake", { id: sessionId, ...filters });
    },

    // 4. Get Items for Session
    getSessionItems: async (sessionId: number) => {
        const { data, error } = await supabase
            .from('inventory_count_items')
            .select('*')
            .eq('session_id', sessionId)
            .order('item_type')
            .order('product_name');
        if (error) throw error;
        return data as InventoryCountItem[];
    },

    // 5. Update Count
    updateItemCount: async (itemId: number, countedQty: number) => {
        const { data, error } = await supabase.from("inventory_count_items").select("session_id").eq("id", itemId).single(); if (error || !data) throw error ?? new Error("Count item not found"); await factoryCommand("record_stocktake_counts", { id: data.session_id, counts: [{ item_id: itemId, counted_quantity: countedQty }] });
    },

    // 6. Reconcile (Finalize)
    reconcileSession: async (sessionId: number) => {
        await factoryCommand("reconcile_stocktake", { id: sessionId });
    },

    // 7. Cancel Session
    cancelSession: async (sessionId: number) => {
        await factoryCommand("cancel_stocktake", { id: sessionId });
    }
};
