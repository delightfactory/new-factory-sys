import { supabase } from "@/integrations/supabase/client";

export interface Transaction {
    id: number;
    treasury_id: number;
    party_id?: string;
    amount: number;
    transaction_type: 'income' | 'expense' | 'transfer';
    category: string;
    description: string;
    reference_type?: string;
    reference_id?: string;
    transaction_date: string;
    created_at: string;
    treasury?: { name: string };
    party?: { name: string };
}

export const FinancialService = {
    // --- Categories Management ---
    getCategories: async (type?: 'income' | 'expense') => {
        let query = supabase.from('financial_categories').select('*').order('name');
        if (type) query = query.eq('type', type);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    createCategory: async (category: { name: string, type: 'income' | 'expense' }) => {
        const { data, error } = await supabase
            .from('financial_categories')
            .insert(category)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    deleteCategory: async (id: number) => {
        const { error } = await supabase.from('financial_categories').delete().eq('id', id);
        if (error) throw error;
    },

    // --- Transactions Management ---
    getTransactions: async (type?: 'income' | 'expense') => {
        // Fetch valid categories
        const { data: categories } = await supabase
            .from('financial_categories')
            .select('name'); // fetch all valid categories

        const allowedCategories = categories?.map(c => c.name) || [];

        let query = supabase
            .from('financial_transactions')
            .select('*, treasury:treasuries(name)')
            .in('category', allowedCategories) // Only show transactions belonging to our P&L categories
            .order('transaction_date', { ascending: false });

        if (type) {
            query = query.eq('transaction_type', type);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Transaction[];
    },

    createTransaction: async (transaction: {
        treasury_id: number;
        amount: number;
        transaction_type: 'income' | 'expense';
        category: string;
        description: string;
        transaction_date: string;
    }) => {
        const { data: treasury } = await supabase.from('treasuries').select('balance').eq('id', transaction.treasury_id).single();
        if (!treasury) throw new Error("الخزينة غير موجودة");

        if (transaction.transaction_type === 'expense' && treasury.balance < transaction.amount) {
            throw new Error("رصيد الخزينة غير كافٍ");
        }

        // 1. Insert Transaction
        const { data, error } = await supabase
            .from('financial_transactions')
            .insert(transaction)
            .select()
            .single();

        if (error) throw error;

        // 2. Update Treasury Balance
        if (transaction.transaction_type === 'expense') {
            await supabase.rpc('decrement_treasury_balance', {
                p_treasury_id: transaction.treasury_id,
                p_amount: transaction.amount
            });
        } else {
            await supabase.rpc('increment_treasury_balance', {
                p_treasury_id: transaction.treasury_id,
                p_amount: transaction.amount
            });
        }

        return data;
    },

    deleteTransaction: async (id: number) => {
        const { data: trx } = await supabase.from('financial_transactions').select('*').eq('id', id).single();
        if (!trx) throw new Error("Transaction not found");

        const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
        if (error) throw error;

        // Revert Balance
        if (trx.transaction_type === 'expense') {
            await supabase.rpc('increment_treasury_balance', {
                p_treasury_id: trx.treasury_id,
                p_amount: trx.amount
            });
        } else {
            await supabase.rpc('decrement_treasury_balance', {
                p_treasury_id: trx.treasury_id,
                p_amount: trx.amount
            });
        }
    },

    // Kept for backward compatibility but using new logic
    getExpenses: async () => { return FinancialService.getTransactions('expense'); },
    createExpense: async (e: {
        treasury_id: number;
        amount: number;
        category: string;
        description: string;
        transaction_date: string;
    }) => { return FinancialService.createTransaction({ ...e, transaction_type: 'expense' }); },
    deleteExpense: async (id: number) => { return FinancialService.deleteTransaction(id); },

    // --- Reports (P&L) ---
    getPnLReport: async (startDate: string, endDate: string) => {
        // 1. Revenue (Posted Sales Invoices)
        const { data: sales, error: salesError } = await supabase
            .from('sales_invoices')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        if (salesError) throw salesError;
        const salesRevenue = sales?.reduce((sum, inv) => sum + inv.total_amount, 0) || 0;

        // 1.b Manual Income (Revenue Categories)
        const { data: incomeConfig } = await supabase.from('financial_categories').select('name').eq('type', 'income');
        const incomeCategories = incomeConfig?.map(c => c.name) || [];

        const { data: otherIncome, error: incomeError } = await supabase
            .from('financial_transactions')
            .select('amount')
            .eq('transaction_type', 'income')
            .in('category', incomeCategories)
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        if (incomeError) throw incomeError;
        const manualRevenue = otherIncome?.reduce((sum, t) => sum + t.amount, 0) || 0;

        const totalRevenue = salesRevenue + manualRevenue;

        // 2. COGS
        const { data: cogsData, error: cogsError } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(status, transaction_date)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', startDate)
            .lte('sales_invoices.transaction_date', endDate);

        if (cogsError) throw cogsError;
        const totalCOGS = cogsData?.reduce((sum, item: any) => sum + (item.quantity * (item.unit_cost_at_sale || 0)), 0) || 0;

        // 3. Expenses
        const { data: expenseConfig } = await supabase.from('financial_categories').select('name').eq('type', 'expense');
        const expenseCategories = expenseConfig?.map(c => c.name) || [];

        const { data: expenses, error: expError } = await supabase
            .from('financial_transactions')
            .select('amount')
            .eq('transaction_type', 'expense')
            .in('category', expenseCategories)
            .gte('transaction_date', startDate)
            .lte('transaction_date', endDate);

        if (expError) throw expError;
        const totalExpenses = expenses?.reduce((sum, t) => sum + t.amount, 0) || 0;

        const grossProfit = totalRevenue - totalCOGS;
        const netProfit = grossProfit - totalExpenses;

        return {
            revenue: totalRevenue,
            cogs: totalCOGS,
            grossProfit,
            expenses: totalExpenses,
            netProfit,
            salesRevenue,
            manualRevenue
        };
    }
};
