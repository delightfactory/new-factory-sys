import { supabase } from "@/integrations/supabase/client";
import { parseDashboardStats, type DashboardStats } from "@/features/dashboard/dashboard-stats";
export type { DashboardStats, ActivityLog } from "@/features/dashboard/dashboard-stats";

export const DashboardService = {
    /**
     * Fetches aggregated dashboard statistics using the database RPC.
     * This is an optimized call that replaces multiple separate queries.
     */
    async getStats(): Promise<DashboardStats> {
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (error) throw new Error("DASHBOARD_STATS_UNAVAILABLE");
        return parseDashboardStats(data);
    },

    /**
     * Fetches detailed audit logs with pagination and filtering
     */
    async getAuditLogs(page: number = 1, pageSize: number = 20, filters?: { action?: string; table_name?: string; user_id?: string }) {
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
