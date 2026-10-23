export interface ActivityLog {
    id: string;
    action: string;
    table_name: string;
    created_at: string;
    user_name: string | null;
}

export interface DashboardStats {
    daily_sales: number;
    active_orders: number;
    low_stock_count: number;
    cash_balance: number;
    recent_activities: ActivityLog[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function parseDashboardStats(value: unknown): DashboardStats {
    if (!isRecord(value) || !finite(value.daily_sales) || !finite(value.cash_balance) ||
        !finite(value.active_orders) || !Number.isSafeInteger(value.active_orders) || value.active_orders < 0 ||
        !finite(value.low_stock_count) || !Number.isSafeInteger(value.low_stock_count) || value.low_stock_count < 0 ||
        !Array.isArray(value.recent_activities)) throw new Error("DASHBOARD_STATS_INVALID");
    const recent_activities = value.recent_activities.map((activity: unknown): ActivityLog => {
        if (!isRecord(activity) || typeof activity.id !== "string" || typeof activity.action !== "string" ||
            typeof activity.table_name !== "string" || typeof activity.created_at !== "string" ||
            (activity.user_name !== null && typeof activity.user_name !== "string")) throw new Error("DASHBOARD_STATS_INVALID");
        return { id: activity.id, action: activity.action, table_name: activity.table_name, created_at: activity.created_at, user_name: activity.user_name };
    });
    return { daily_sales: value.daily_sales, active_orders: value.active_orders, low_stock_count: value.low_stock_count, cash_balance: value.cash_balance, recent_activities };
}
