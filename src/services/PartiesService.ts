import { supabase } from "@/integrations/supabase/client";

export interface Party {
    id: string; // Changed to string (UUID)
    name: string;
    type: 'supplier' | 'customer';
    phone?: string;
    email?: string;
    address?: string;
    tax_number?: string;
    commercial_record?: string;
    balance: number;
    credit_limit?: number;
    created_at?: string;
}

export const PartiesService = {
    // Get all parties (optionally filter by type)
    getParties: async (type?: 'supplier' | 'customer') => {
        let query = supabase
            .from('parties')
            .select('*')
            .order('name');

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Party[];
    },

    // Get single party
    getParty: async (id: string) => {
        const { data, error } = await supabase
            .from('parties')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data as Party[];
    },

    // Create party
    createParty: async (party: Partial<Party>) => {
        const { data, error } = await supabase
            .from('parties')
            .insert(party)
            .select()
            .single();
        if (error) throw error;
        return data as Party;
    },

    // Update party
    updateParty: async (id: string, updates: Partial<Party>) => {
        const { data, error } = await supabase
            .from('parties')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data as Party;
    },

    // Delete party (Check if they have transactions first? DB restrict will handle it)
    deleteParty: async (id: string) => {
        const { error } = await supabase
            .from('parties')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
};
