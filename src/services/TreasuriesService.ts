import { supabase } from "@/integrations/supabase/client";

export interface Treasury {
    id: number;
    name: string;
    type: 'cash' | 'bank';
    currency?: string;
    account_number?: string;
    balance: number;
    description?: string;
    created_at?: string;
}

export const TreasuriesService = {
    // Get all treasuries
    getTreasuries: async () => {
        const { data, error } = await supabase
            .from('treasuries')
            .select('*')
            .order('id');
        if (error) throw error;
        return data as Treasury[];
    },

    // Get single treasury
    getTreasury: async (id: number) => {
        const { data, error } = await supabase
            .from('treasuries')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Treasury;
    },

    // Create treasury
    createTreasury: async (treasury: Partial<Treasury>) => {
        const { data, error } = await supabase
            .from('treasuries')
            .insert(treasury)
            .select()
            .single();
        if (error) throw error;
        return data as Treasury;
    },

    // Update treasury
    updateTreasury: async (id: number, updates: Partial<Treasury>) => {
        const { data, error } = await supabase
            .from('treasuries')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as Treasury;
    },

    // Operations
    deposit: async (data: { treasury_id: number, amount: number, description: string }) => {
        const { error } = await supabase.rpc('handle_treasury_transaction', {
            p_treasury_id: data.treasury_id,
            p_amount: data.amount,
            p_transaction_type: 'income',
            p_category: 'manual_deposit',
            p_description: data.description
        });
        if (error) throw error;
    },

    withdraw: async (data: { treasury_id: number, amount: number, description: string }) => {
        const { error } = await supabase.rpc('handle_treasury_transaction', {
            p_treasury_id: data.treasury_id,
            p_amount: data.amount,
            p_transaction_type: 'expense',
            p_category: 'manual_withdraw',
            p_description: data.description
        });
        if (error) throw error;
    },

    transfer: async (data: { from_id: number, to_id: number, amount: number, description: string }) => {
        const { error } = await supabase.rpc('transfer_between_treasuries', {
            p_from_treasury_id: data.from_id,
            p_to_treasury_id: data.to_id,
            p_amount: data.amount,
            p_description: data.description
        });
        if (error) throw error;
    },

    // Unified Transaction Entry (Receipts/Payments with Party Link)
    addTransaction: async (data: {
        treasury_id: number,
        amount: number,
        type: 'income' | 'expense',
        category: string,
        description: string,
        party_id?: string | null,
        invoice_id?: number | null,
        invoice_type?: 'purchase' | 'sales' | null
    }) => {
        const { error } = await supabase.rpc('handle_treasury_transaction', {
            p_treasury_id: data.treasury_id,
            p_amount: data.amount,
            p_transaction_type: data.type,
            p_category: data.category,
            p_description: data.description,
            p_party_id: data.party_id,
            p_invoice_id: data.invoice_id,
            p_invoice_type: data.invoice_type
        });
        if (error) throw error;
    }
};
