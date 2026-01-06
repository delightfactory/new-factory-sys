import { supabase } from "@/integrations/supabase/client";

// Types
export interface AlertItem {
    id: string;
    type: 'critical' | 'warning' | 'info';
    category: 'inventory' | 'finance' | 'production' | 'sales';
    title: string;
    description: string;
    value?: number;
    action: {
        label: string;
        path: string;
    };
}

export interface LiquidityData {
    treasuryBalance: number;
    receivables: number;
    payables: number;
    netCash: number;
    treasuries: { name: string; balance: number }[];
}

export interface CoverageItem {
    id: number;
    name: string;
    type: 'raw' | 'packaging';
    quantity: number;
    minStock: number;
    avgDailyUsage: number;
    daysLeft: number;
    status: 'critical' | 'warning' | 'ok';
}

export interface ProductionStatus {
    pendingProduction: number;
    pendingPackaging: number;
    oldestPendingDays: number;
    productionValue: number;
    packagingValue: number;
}

export interface ProfitabilityData {
    revenue30d: number;
    cogs30d: number;
    grossMargin: number;
    grossMarginPercent: number;
    topProducts: { name: string; revenue: number; margin: number }[];
}

export interface TrendData {
    dates: string[];
    sales: number[];
    purchases: number[];
    expenses: number[];
}

export interface DecisionSupportData {
    alerts: AlertItem[];
    liquidity: LiquidityData;
    coverage: CoverageItem[];
    production: ProductionStatus;
    profitability: ProfitabilityData;
    trends: TrendData;
    generatedAt: string;
}

export const DecisionSupportService = {
    /**
     * Get comprehensive decision support data
     */
    async getDecisionSupportData(): Promise<DecisionSupportData> {
        const [
            alerts,
            liquidity,
            coverage,
            production,
            profitability,
            trends
        ] = await Promise.all([
            DecisionSupportService.getAlerts(),
            DecisionSupportService.getLiquidity(),
            DecisionSupportService.getInventoryCoverage(),
            DecisionSupportService.getProductionStatus(),
            DecisionSupportService.getProfitability(),
            DecisionSupportService.getTrends()
        ]);

        return {
            alerts,
            liquidity,
            coverage,
            production,
            profitability,
            trends,
            generatedAt: new Date().toISOString()
        };
    },

    /**
     * Get urgent alerts that need immediate action
     */
    async getAlerts(): Promise<AlertItem[]> {
        const alerts: AlertItem[] = [];

        // 1. Low Stock Raw Materials
        const { data: rawMaterials } = await supabase
            .from('raw_materials')
            .select('id, name, quantity, min_stock');

        const lowStockRaw = rawMaterials?.filter(r =>
            r.min_stock && r.quantity < r.min_stock
        ) || [];

        if (lowStockRaw.length > 0) {
            alerts.push({
                id: 'low-stock-raw',
                type: lowStockRaw.length > 5 ? 'critical' : 'warning',
                category: 'inventory',
                title: `${lowStockRaw.length} مادة خام تحت الحد الأدنى`,
                description: lowStockRaw.slice(0, 3).map(r => r.name).join('، ') + (lowStockRaw.length > 3 ? '...' : ''),
                value: lowStockRaw.length,
                action: { label: 'عرض التفاصيل', path: '/reports/low-stock' }
            });
        }

        // 2. Low Stock Packaging Materials
        const { data: pkgMaterials } = await supabase
            .from('packaging_materials')
            .select('id, name, quantity, min_stock');

        const lowStockPkg = pkgMaterials?.filter(p =>
            p.min_stock && p.quantity < p.min_stock
        ) || [];

        if (lowStockPkg.length > 0) {
            alerts.push({
                id: 'low-stock-pkg',
                type: lowStockPkg.length > 3 ? 'critical' : 'warning',
                category: 'inventory',
                title: `${lowStockPkg.length} مستلزم تعبئة تحت الحد الأدنى`,
                description: lowStockPkg.slice(0, 3).map(p => p.name).join('، '),
                value: lowStockPkg.length,
                action: { label: 'عرض التفاصيل', path: '/reports/low-stock' }
            });
        }

        // 3. Pending Production Orders > 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: pendingProduction } = await supabase
            .from('production_orders')
            .select('id, code, date')
            .eq('status', 'pending')
            .lt('date', sevenDaysAgo.toISOString().split('T')[0]);

        if (pendingProduction && pendingProduction.length > 0) {
            alerts.push({
                id: 'pending-production',
                type: 'warning',
                category: 'production',
                title: `${pendingProduction.length} أمر إنتاج معلق أكثر من 7 أيام`,
                description: `الأمر الأقدم: ${pendingProduction[0]?.code}`,
                value: pendingProduction.length,
                action: { label: 'عرض الأوامر', path: '/production/orders' }
            });
        }

        // 4. Overdue Customer Invoices (60+ days)
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        const { data: overdueInvoices } = await supabase
            .from('sales_invoices')
            .select('id, total_amount, paid_amount, transaction_date, customer:parties!customer_id(name)')
            .eq('status', 'posted')
            .lt('transaction_date', sixtyDaysAgo.toISOString().split('T')[0]);

        const overdueWithBalance = overdueInvoices?.filter(inv =>
            (inv.total_amount - (inv.paid_amount || 0)) > 0
        ) || [];

        if (overdueWithBalance.length > 0) {
            const totalOverdue = overdueWithBalance.reduce((sum, inv) =>
                sum + (inv.total_amount - (inv.paid_amount || 0)), 0
            );
            alerts.push({
                id: 'overdue-receivables',
                type: 'critical',
                category: 'finance',
                title: `${overdueWithBalance.length} فاتورة متأخرة أكثر من 60 يوم`,
                description: `إجمالي المتأخرات: ${totalOverdue.toLocaleString('ar-EG')} ج.م`,
                value: totalOverdue,
                action: { label: 'تقرير أعمار الديون', path: '/reports/aging' }
            });
        }

        // 5. Negative Treasury Balance
        const { data: treasuries } = await supabase
            .from('treasuries')
            .select('id, name, balance')
            .lt('balance', 0);

        if (treasuries && treasuries.length > 0) {
            alerts.push({
                id: 'negative-treasury',
                type: 'critical',
                category: 'finance',
                title: `${treasuries.length} خزينة برصيد سالب`,
                description: treasuries.map(t => `${t.name}: ${t.balance.toLocaleString()}`).join('، '),
                action: { label: 'إدارة الخزائن', path: '/treasuries' }
            });
        }

        return alerts.sort((a, b) => {
            const priority = { critical: 0, warning: 1, info: 2 };
            return priority[a.type] - priority[b.type];
        });
    },

    /**
     * Get liquidity indicators
     */
    async getLiquidity(): Promise<LiquidityData> {
        // Treasury balances
        const { data: treasuries } = await supabase
            .from('treasuries')
            .select('name, balance');

        const treasuryBalance = treasuries?.reduce((sum, t) => sum + (t.balance || 0), 0) || 0;

        // Customer receivables (positive balance = they owe us)
        const { data: customers } = await supabase
            .from('parties')
            .select('balance')
            .eq('type', 'customer')
            .gt('balance', 0);

        const receivables = customers?.reduce((sum, c) => sum + c.balance, 0) || 0;

        // Supplier payables (negative balance = we owe them)
        const { data: suppliers } = await supabase
            .from('parties')
            .select('balance')
            .eq('type', 'supplier')
            .lt('balance', 0);

        const payables = Math.abs(suppliers?.reduce((sum, s) => sum + s.balance, 0) || 0);

        return {
            treasuryBalance,
            receivables,
            payables,
            netCash: treasuryBalance + receivables - payables,
            treasuries: treasuries?.map(t => ({ name: t.name, balance: t.balance || 0 })) || []
        };
    },

    /**
     * Get inventory coverage analysis
     */
    async getInventoryCoverage(): Promise<CoverageItem[]> {
        const items: CoverageItem[] = [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Raw materials with movement analysis
        const { data: rawMaterials } = await supabase
            .from('raw_materials')
            .select('id, name, quantity, min_stock');

        // Get consumption from inventory movements (last 30 days)
        const { data: rawMovements } = await supabase
            .from('inventory_movements')
            .select('item_id, quantity')
            .eq('item_type', 'raw_materials')
            .eq('direction', 'out')
            .gte('movement_date', thirtyDaysAgo.toISOString().split('T')[0]);

        // Calculate daily usage per item
        const rawUsage = new Map<number, number>();
        rawMovements?.forEach(m => {
            rawUsage.set(m.item_id, (rawUsage.get(m.item_id) || 0) + m.quantity);
        });

        rawMaterials?.forEach(rm => {
            const totalUsage = rawUsage.get(rm.id) || 0;
            const avgDailyUsage = totalUsage / 30;
            const daysLeft = avgDailyUsage > 0 ? rm.quantity / avgDailyUsage : 999;

            items.push({
                id: rm.id,
                name: rm.name,
                type: 'raw',
                quantity: rm.quantity,
                minStock: rm.min_stock || 0,
                avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
                daysLeft: Math.round(daysLeft),
                status: daysLeft < 7 ? 'critical' : daysLeft < 14 ? 'warning' : 'ok'
            });
        });

        // Sort by days left (critical first)
        return items
            .filter(i => i.avgDailyUsage > 0) // Only items with actual usage
            .sort((a, b) => a.daysLeft - b.daysLeft);
    },

    /**
     * Get production status
     */
    async getProductionStatus(): Promise<ProductionStatus> {
        // Pending production orders
        const { data: pendingProd } = await supabase
            .from('production_orders')
            .select('id, date, total_cost')
            .eq('status', 'pending');

        // Pending packaging orders
        const { data: pendingPkg } = await supabase
            .from('packaging_orders')
            .select('id, date, total_cost')
            .eq('status', 'pending');

        // Calculate oldest pending
        const allDates = [
            ...(pendingProd?.map(p => new Date(p.date)) || []),
            ...(pendingPkg?.map(p => new Date(p.date)) || [])
        ];
        const oldestDate = allDates.length > 0 ? Math.min(...allDates.map(d => d.getTime())) : Date.now();
        const oldestDays = Math.floor((Date.now() - oldestDate) / (1000 * 60 * 60 * 24));

        return {
            pendingProduction: pendingProd?.length || 0,
            pendingPackaging: pendingPkg?.length || 0,
            oldestPendingDays: oldestDays,
            productionValue: pendingProd?.reduce((sum, p) => sum + (p.total_cost || 0), 0) || 0,
            packagingValue: pendingPkg?.reduce((sum, p) => sum + (p.total_cost || 0), 0) || 0
        };
    },

    /**
     * Get profitability data (last 30 days)
     */
    async getProfitability(): Promise<ProfitabilityData> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        // Sales revenue
        const { data: sales } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        const revenue30d = sales?.reduce((sum, s) => sum + s.total_amount, 0) || 0;

        // COGS
        const { data: salesItems } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(status, transaction_date)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', startDate)
            .lte('sales_invoices.transaction_date', endDate);

        const cogs30d = salesItems?.reduce((sum, item: any) =>
            sum + (item.quantity * (item.unit_cost_at_sale || 0)), 0
        ) || 0;

        // Top products by revenue
        const { data: productSales } = await supabase
            .from('sales_invoice_items')
            .select(`
                finished_product_id,
                quantity,
                unit_price,
                unit_cost_at_sale,
                finished_products(name),
                sales_invoices!inner(status, transaction_date)
            `)
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', startDate)
            .lte('sales_invoices.transaction_date', endDate)
            .not('finished_product_id', 'is', null);

        // Aggregate by product
        const productMap = new Map<number, { name: string; revenue: number; cost: number }>();
        productSales?.forEach((item: any) => {
            const id = item.finished_product_id;
            const existing = productMap.get(id) || {
                name: item.finished_products?.name || 'غير معروف',
                revenue: 0,
                cost: 0
            };
            existing.revenue += item.quantity * (item.unit_price || 0);
            existing.cost += item.quantity * (item.unit_cost_at_sale || 0);
            productMap.set(id, existing);
        });

        const topProducts = Array.from(productMap.values())
            .map(p => ({ name: p.name, revenue: p.revenue, margin: p.revenue - p.cost }))
            .sort((a, b) => b.margin - a.margin)
            .slice(0, 5);

        const grossMargin = revenue30d - cogs30d;

        return {
            revenue30d,
            cogs30d,
            grossMargin,
            grossMarginPercent: revenue30d > 0 ? Math.round((grossMargin / revenue30d) * 100) : 0,
            topProducts
        };
    },

    /**
     * Get trend data for charts
     */
    async getTrends(): Promise<TrendData> {
        const dates: string[] = [];
        const sales: number[] = [];
        const purchases: number[] = [];
        const expenses: number[] = [];

        // Generate last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }

        // Fetch daily sales
        const { data: salesData } = await supabase
            .from('sales_invoices')
            .select('transaction_date, total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', dates[0])
            .lte('transaction_date', dates[dates.length - 1]);

        // Fetch daily purchases
        const { data: purchasesData } = await supabase
            .from('purchase_invoices')
            .select('transaction_date, total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', dates[0])
            .lte('transaction_date', dates[dates.length - 1]);

        // Aggregate by date
        dates.forEach(date => {
            const daySales = salesData?.filter(s => s.transaction_date === date)
                .reduce((sum, s) => sum + s.total_amount, 0) || 0;
            const dayPurchases = purchasesData?.filter(p => p.transaction_date === date)
                .reduce((sum, p) => sum + p.total_amount, 0) || 0;

            sales.push(daySales);
            purchases.push(dayPurchases);
            expenses.push(0); // Can be enhanced later
        });

        return { dates, sales, purchases, expenses };
    }
};
