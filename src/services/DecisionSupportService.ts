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
    previousRevenue30d: number;
    previousCogs30d: number;
    revenueChange: number;
    marginChange: number;
}

export interface TrendData {
    dates: string[];
    sales: number[];
    purchases: number[];
    expenses: number[];
    profit: number[];
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

        // 6. Low Margin Products (margin < 15%)
        const { data: finishedProducts } = await supabase
            .from('finished_products')
            .select('id, name, unit_cost, sales_price, quantity');

        const lowMarginProducts = finishedProducts?.filter(p => {
            if (!p.sales_price || p.sales_price <= 0) return false;
            const margin = ((p.sales_price - (p.unit_cost || 0)) / p.sales_price) * 100;
            return margin < 15 && margin >= 0;
        }) || [];

        const negativeMarginProducts = finishedProducts?.filter(p => {
            if (!p.sales_price || p.sales_price <= 0) return false;
            return (p.unit_cost || 0) > p.sales_price;
        }) || [];

        if (negativeMarginProducts.length > 0) {
            alerts.push({
                id: 'negative-margin',
                type: 'critical',
                category: 'sales',
                title: `${negativeMarginProducts.length} منتج بهامش ربح سلبي!`,
                description: negativeMarginProducts.slice(0, 3).map(p => p.name).join('، '),
                value: negativeMarginProducts.length,
                action: { label: 'تحليل التسعير', path: '/reports/pricing-analysis' }
            });
        } else if (lowMarginProducts.length > 0) {
            alerts.push({
                id: 'low-margin',
                type: 'warning',
                category: 'sales',
                title: `${lowMarginProducts.length} منتج بهامش ربح أقل من 15%`,
                description: lowMarginProducts.slice(0, 3).map(p => p.name).join('، '),
                value: lowMarginProducts.length,
                action: { label: 'تحليل التسعير', path: '/reports/pricing-analysis' }
            });
        }

        // 7. Declining Sales (this week vs last week)
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const { data: thisWeekSales } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', oneWeekAgo.toISOString().split('T')[0]);

        const { data: lastWeekSales } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', twoWeeksAgo.toISOString().split('T')[0])
            .lt('transaction_date', oneWeekAgo.toISOString().split('T')[0]);

        const thisWeekTotal = thisWeekSales?.reduce((s, i) => s + i.total_amount, 0) || 0;
        const lastWeekTotal = lastWeekSales?.reduce((s, i) => s + i.total_amount, 0) || 0;

        if (lastWeekTotal > 0 && thisWeekTotal < lastWeekTotal * 0.7) {
            const declinePercent = Math.round(((lastWeekTotal - thisWeekTotal) / lastWeekTotal) * 100);
            alerts.push({
                id: 'declining-sales',
                type: 'warning',
                category: 'sales',
                title: `انخفاض المبيعات بنسبة ${declinePercent}%`,
                description: `هذا الأسبوع: ${thisWeekTotal.toLocaleString()} vs الأسبوع الماضي: ${lastWeekTotal.toLocaleString()}`,
                value: declinePercent,
                action: { label: 'تحليل الاتجاهات', path: '/reports/trends' }
            });
        }

        // 8. Supplier Payables Alert
        const { data: supplierPayables } = await supabase
            .from('parties')
            .select('name, balance')
            .eq('type', 'supplier')
            .lt('balance', 0);

        const totalPayables = Math.abs(supplierPayables?.reduce((s, p) => s + p.balance, 0) || 0);
        if (totalPayables > 0 && supplierPayables && supplierPayables.length > 0) {
            alerts.push({
                id: 'supplier-payables',
                type: totalPayables > 50000 ? 'warning' : 'info',
                category: 'finance',
                title: `مستحقات للموردين: ${totalPayables.toLocaleString()} ج.م`,
                description: `${supplierPayables.length} مورد — الأعلى: ${supplierPayables.sort((a, b) => a.balance - b.balance)[0]?.name}`,
                value: totalPayables,
                action: { label: 'تقرير أعمار الديون', path: '/reports/aging' }
            });
        }

        // 9. Stagnant Inventory (finished products with no movements in 30+ days)
        const thirtyDaysAgoAlert = new Date();
        thirtyDaysAgoAlert.setDate(thirtyDaysAgoAlert.getDate() - 30);

        // inventory_movements table may not exist — handle gracefully
        let movedIds = new Set<number>();
        try {
            const { data: recentMovements, error: movErr } = await supabase
                .from('inventory_movements')
                .select('item_id')
                .eq('item_type', 'finished_products')
                .gte('created_at', thirtyDaysAgoAlert.toISOString());
            if (!movErr && recentMovements) {
                movedIds = new Set(recentMovements.map(m => m.item_id) || []);
            }
        } catch { /* table may not exist */ }

        const stagnant = finishedProducts?.filter(p => p.quantity > 0 && !movedIds.has(p.id)) || [];

        if (stagnant.length > 0) {
            alerts.push({
                id: 'stagnant-inventory',
                type: 'info',
                category: 'inventory',
                title: `${stagnant.length} منتج بدون حركة منذ 30+ يوم`,
                description: stagnant.slice(0, 3).map(p => p.name).join('، '),
                value: stagnant.length,
                action: { label: 'تحليل المخزون', path: '/reports/inventory-analytics' }
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
     * Get profitability data (last 30 days) with month-over-month comparison
     */
    async getProfitability(): Promise<ProfitabilityData> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        // Previous period (30-60 days ago)
        const sixtyDaysAgoDate = new Date();
        sixtyDaysAgoDate.setDate(sixtyDaysAgoDate.getDate() - 60);
        const prevStartDate = sixtyDaysAgoDate.toISOString().split('T')[0];

        // Sales revenue (current period)
        const { data: sales } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        const revenue30d = sales?.reduce((sum, s) => sum + s.total_amount, 0) || 0;

        // Sales revenue (previous period)
        const { data: prevSales } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', prevStartDate)
            .lt('transaction_date', startDate);

        const previousRevenue30d = prevSales?.reduce((sum, s) => sum + s.total_amount, 0) || 0;

        // COGS (current period)
        const { data: salesItems } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(status, transaction_date)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', startDate)
            .lte('sales_invoices.transaction_date', endDate);

        const cogs30d = salesItems?.reduce((sum, item: any) =>
            sum + (item.quantity * (item.unit_cost_at_sale || 0)), 0
        ) || 0;

        // COGS (previous period)
        const { data: prevSalesItems } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(status, transaction_date)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', prevStartDate)
            .lt('sales_invoices.transaction_date', startDate);

        const previousCogs30d = prevSalesItems?.reduce((sum, item: any) =>
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
        const previousGrossMargin = previousRevenue30d - previousCogs30d;
        const previousMarginPercent = previousRevenue30d > 0 ? (previousGrossMargin / previousRevenue30d) * 100 : 0;
        const currentMarginPercent = revenue30d > 0 ? (grossMargin / revenue30d) * 100 : 0;

        return {
            revenue30d,
            cogs30d,
            grossMargin,
            grossMarginPercent: Math.round(currentMarginPercent),
            topProducts,
            previousRevenue30d,
            previousCogs30d,
            revenueChange: previousRevenue30d > 0 ? Math.round(((revenue30d - previousRevenue30d) / previousRevenue30d) * 100) : 0,
            marginChange: Math.round(currentMarginPercent - previousMarginPercent)
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
        const profit: number[] = [];

        // Categories that are NOT operating expenses (supplier payments, transfers)
        const excludeExpenseCategories = ['payment', 'purchase_payment', 'سداد مورد', 'transfer', 'تحويل'];

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

        // Fetch daily purchases (for display, not profit calc)
        const { data: purchasesData } = await supabase
            .from('purchase_invoices')
            .select('transaction_date, total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', dates[0])
            .lte('transaction_date', dates[dates.length - 1]);

        // Fetch COGS from sales_invoice_items
        const { data: cogsData } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(transaction_date, status)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', dates[0])
            .lte('sales_invoices.transaction_date', dates[dates.length - 1]);

        // Fetch daily expenses (with category for filtering) — includes salary/payroll
        const { data: expensesData } = await supabase
            .from('financial_transactions')
            .select('transaction_date, amount, category')
            .eq('transaction_type', 'expense')
            .gte('transaction_date', dates[0])
            .lte('transaction_date', dates[dates.length - 1]);

        // Filter out payment categories from expenses
        const filteredExpenses = (expensesData || []).filter((e: any) =>
            !excludeExpenseCategories.some(cat => (e.category || '').toLowerCase().includes(cat.toLowerCase()))
        );

        // Aggregate by date
        dates.forEach(date => {
            const daySales = salesData?.filter(s => s.transaction_date === date)
                .reduce((sum, s) => sum + s.total_amount, 0) || 0;
            const dayPurchases = purchasesData?.filter(p => p.transaction_date === date)
                .reduce((sum, p) => sum + p.total_amount, 0) || 0;
            const dayCogs = cogsData?.filter((c: any) => c.sales_invoices?.transaction_date === date)
                .reduce((sum: number, c: any) => sum + (c.quantity * (c.unit_cost_at_sale || 0)), 0) || 0;
            const dayExpenses = filteredExpenses.filter((e: any) => e.transaction_date === date)
                .reduce((sum: number, e: any) => sum + e.amount, 0) || 0;

            sales.push(daySales);
            purchases.push(dayPurchases);
            expenses.push(dayExpenses);
            // Profit = Revenue - COGS - Operating Expenses (includes salary)
            profit.push(daySales - dayCogs - dayExpenses);
        });

        return { dates, sales, purchases, expenses, profit };
    }
};
