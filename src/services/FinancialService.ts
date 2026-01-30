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
    // --- Transactions Management ---
    getTransactions: async (options?: {
        type?: 'income' | 'expense' | 'transfer',
        startDate?: string,
        endDate?: string,
        limit?: number,
        excludeTransfers?: boolean,
        partyRelatedOnly?: boolean
    }) => {
        let query = supabase
            .from('financial_transactions')
            .select('*, treasury:treasuries(name)')
            .order('transaction_date', { ascending: false });

        if (options?.type) {
            if (options.type === 'transfer') {
                // For transfers, filter by category containing 'transfer' or type 'transfer'
                query = query.or('category.ilike.%transfer%,transaction_type.eq.transfer');
            } else {
                // For income/expense, exclude transfers
                query = query.eq('transaction_type', options.type)
                    .not('category', 'ilike', '%transfer%');
            }
        }

        // Exclude transfers when explicitly requested
        if (options?.excludeTransfers) {
            query = query.not('category', 'ilike', '%transfer%')
                .neq('transaction_type', 'transfer');
        }

        // Filter to only party-related transactions (receipts, payments, etc.)
        if (options?.partyRelatedOnly) {
            // Only show transactions with party_id OR with commercial categories
            query = query.or('party_id.not.is.null,category.in.(receipt,payment,purchase,sales,refund,purchase_payment)');
        }

        if (options?.startDate) {
            query = query.gte('transaction_date', options.startDate);
        }

        if (options?.endDate) {
            query = query.lte('transaction_date', options.endDate);
        }

        if (options?.limit) {
            query = query.limit(options.limit);
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
    getExpenses: async () => { return FinancialService.getTransactions({ type: 'expense' }); },
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

        // 1.b Sales Returns (Posted) - Reduce Revenue
        const { data: returns, error: returnsError } = await supabase
            .from('sales_returns')
            .select('total_amount')
            .eq('status', 'posted')
            .gte('return_date', startDate)
            .lte('return_date', endDate);

        if (returnsError) throw returnsError;
        const returnsAmount = returns?.reduce((sum, r) => sum + r.total_amount, 0) || 0;

        // 1.c Manual Income (Revenue Categories)
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

        // Net Revenue = Sales - Returns + Manual Income
        const totalRevenue = salesRevenue - returnsAmount + manualRevenue;

        // 2. COGS (Posted Sales)
        const { data: cogsData, error: cogsError } = await supabase
            .from('sales_invoice_items')
            .select('quantity, unit_cost_at_sale, sales_invoices!inner(status, transaction_date)')
            .eq('sales_invoices.status', 'posted')
            .gte('sales_invoices.transaction_date', startDate)
            .lte('sales_invoices.transaction_date', endDate);

        if (cogsError) throw cogsError;
        const salesCOGS = cogsData?.reduce((sum, item: any) => sum + (item.quantity * (item.unit_cost_at_sale || 0)), 0) || 0;

        // 2.b Return COGS (reduce COGS since returned items add back to inventory)
        const { data: returnCogsData, error: returnCogsError } = await supabase
            .from('sales_return_items')
            .select('quantity, unit_cost_at_return, sales_returns!inner(status, return_date)')
            .eq('sales_returns.status', 'posted')
            .gte('sales_returns.return_date', startDate)
            .lte('sales_returns.return_date', endDate);

        if (returnCogsError) throw returnCogsError;
        const returnCOGS = returnCogsData?.reduce((sum, item: any) => sum + (item.quantity * (item.unit_cost_at_return || 0)), 0) || 0;

        // Net COGS = Sales COGS - Return COGS
        const totalCOGS = salesCOGS - returnCOGS;

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
            manualRevenue,
            returnsAmount,    // NEW: for detailed display
            salesCOGS,        // NEW: for detailed display
            returnCOGS        // NEW: for detailed display
        };
    }
};
