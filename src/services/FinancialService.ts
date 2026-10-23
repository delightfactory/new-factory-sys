import {readFinancialCategories} from './FinancialCategoryService';
import {readProfitReport} from './ProfitReportService';
import {legacyProfitResult} from '@/features/reports/profit-ledger';
import { factoryCommand, fields } from "./FactoryCommandsService";
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

export interface FinancialReversalPlan {
    id: number;
    amount: number;
    requires_pair: boolean;
    candidates: { id: number; treasury_name: string; amount: number; description: string; date: string }[];
}

export const FinancialService = {
    // --- Categories Management ---
    getCategories: readFinancialCategories,

    createCategory: async (category: { name: string, type: 'income' | 'expense' }) => {
        return factoryCommand("create_financial_category", category);
    },

    deleteCategory: async (id: number) => {
        const { data, error } = await supabase.from('financial_categories').delete().eq('id', id).select('id');
        if (error) throw error;
        if (data?.length !== 1 || data[0].id !== id) throw new Error('لم يُؤكد حذف البند. حدّث القائمة وراجع صلاحيته قبل إعادة المحاولة.');
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
        return factoryCommand("record_financial_transaction", { ...fields(transaction, ["treasury_id", "amount", "category", "description"]), type: transaction.transaction_type, date: transaction.transaction_date });
    },

    deleteTransaction: async (id: number) => {
        await factoryCommand("delete_financial_transaction", { id });
    },

    getReversalPlan: async (id: number): Promise<FinancialReversalPlan> => {
        const { data, error } = await supabase.rpc("factory_native_financial_reversal_plan", { p_id: id });
        if (error) throw new Error("تعذر تحميل تفاصيل الحركة. أعد المحاولة قبل تأكيد الإلغاء.");
        const plan = data as FinancialReversalPlan | null;
        if (!plan || plan.id !== id || !Number.isFinite(plan.amount) || plan.amount <= 0 || typeof plan.requires_pair !== 'boolean' || !Array.isArray(plan.candidates) || plan.candidates.some(candidate => !Number.isSafeInteger(candidate.id) || candidate.id <= 0 || !Number.isFinite(candidate.amount) || candidate.amount <= 0 || typeof candidate.treasury_name !== 'string' || typeof candidate.date !== 'string'))
            throw new Error('تعذر التحقق من تفاصيل الحركة. أعد تحميلها قبل الإلغاء.');
        return plan;
    },

    reverseTransaction: async ({ id, pairId }: { id: number; pairId?: number }) => {
        return factoryCommand("delete_financial_transaction", { id, ...(pairId === undefined ? {} : { pair_id: pairId }) });
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
        return legacyProfitResult(await readProfitReport({from: startDate, to: endDate}));
    }
};
