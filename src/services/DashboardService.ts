import { supabase } from "@/integrations/supabase/client";

export interface DashboardStats {
    daily_sales: number;
    active_orders: number;
    low_stock_count: number;
    cash_balance: number;
    recent_activities: ActivityLog[];
}

export interface ActivityLog {
    id: string;
    action: string;
    table_name: string;
    created_at: string;
    user_name: string | null;
}

export const DashboardService = {
    /**
     * Fetches aggregated dashboard statistics using the database RPC.
     * This is an optimized call that replaces multiple separate queries.
     */
    async getStats(): Promise<DashboardStats | null> {
        try {
            const { data, error } = await supabase.rpc('get_dashboard_stats');

            if (error) {
                console.error('Error fetching dashboard stats:', error);
                throw error;
            }

            // Parse the JSONB data returned by the RPC
            // The RPC returns a JSON object, so Supabase might wrap it or return it directly depending on driver
            // Typically RPC returning JSONB comes as data directly
            return data as unknown as DashboardStats;
        } catch (error) {
            console.error('Unexpected error in getStats:', error);
            return null;
        }
    },

    /**
     * Fetches detailed audit logs with pagination and filtering
     */
    async getAuditLogs(page: number = 1, pageSize: number = 20, filters?: any) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('audit_logs')
            .select(`
                *,
                user:profiles(full_name, role)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (filters?.action) {
            query = query.eq('action', filters.action);
        }
        if (filters?.table_name) {
            query = query.eq('table_name', filters.table_name);
        }
        if (filters?.user_id) { // Accept user_id filter
            query = query.eq('user_id', filters.user_id);
        }

        const { data, error, count } = await query;

        if (error) throw error;

        return { data, count };
    }
};
