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
        // Generate Code
        const { data: code } = await supabase.rpc('get_next_code', { table_name: 'inventory_count_sessions', prefix: 'ST' });

        const { data, error } = await supabase
            .from('inventory_count_sessions')
            .insert({ ...session, code: code as string })
            .select()
            .single();

        if (error) throw error;
        return data as InventorySession;
    },

    // 3. Generate Snapshot (Start Counting)
    startSession: async (sessionId: number, filters: { raw: boolean, packaging: boolean, semi: boolean, finished: boolean }) => {
        const { error } = await supabase.rpc('generate_inventory_snapshot', {
            p_session_id: sessionId,
            p_include_raw: filters.raw,
            p_include_packaging: filters.packaging,
            p_include_semi: filters.semi,
            p_include_finished: filters.finished
        });
        if (error) throw error;
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
        const { error } = await supabase
            .from('inventory_count_items')
            .update({ counted_quantity: countedQty })
            .eq('id', itemId);
        if (error) throw error;
    },

    // 6. Reconcile (Finalize)
    reconcileSession: async (sessionId: number) => {
        const { error } = await supabase.rpc('reconcile_inventory_session', { p_session_id: sessionId });
        if (error) throw error;
    },

    // 7. Cancel Session
    cancelSession: async (sessionId: number) => {
        const { error } = await supabase
            .from('inventory_count_sessions')
            .update({ status: 'cancelled' })
            .eq('id', sessionId);
        if (error) throw error;
    }
};
