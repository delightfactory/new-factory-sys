import { factoryCommand, fields } from "./FactoryCommandsService";
import { supabase } from "@/integrations/supabase/client";
import { readCompleteRows } from "@/platform/data/read-complete-rows";
import type { Transaction } from "./FinancialService";
import type { CashEntry } from '@/features/treasuries/treasury-statement';

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
    getStatement: async (id: number) => {
        const treasury = await TreasuriesService.getTreasury(id);
        const entries = await readCompleteRows<CashEntry>(async (from, to) => {
            const { data, error, count } = await supabase.from('financial_transactions')
                .select('*,party:parties(name)', { count: 'exact' }).eq('treasury_id', id)
                .order('transaction_date').order('created_at').order('id').range(from, to);
            return { rows: data as CashEntry[] | null, error, count };
        }, 'TREASURY_STATEMENT');
        return { treasury, entries };
    },
    getPartyMonthTransactions: async (period: {startDate: string; endDate: string}) =>
        readCompleteRows<Transaction>(async (from,to) => {
            const {data,error,count}=await supabase.from('financial_transactions')
                .select('*,treasury:treasuries(name)', {count:'exact'})
                .not('category','ilike','%transfer%').neq('transaction_type','transfer')
                .or('party_id.not.is.null,category.in.(receipt,payment,purchase,sales,refund,purchase_payment)')
                .gte('transaction_date',period.startDate).lte('transaction_date',period.endDate)
                .order('transaction_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false})
                .range(from,to);
            return {rows:data as Transaction[]|null,error,count};
        }, 'PARTY_MONTH_TRANSACTIONS'),
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
        return factoryCommand<Treasury>("create_treasury", { ...fields(treasury, ["name", "type", "currency", "account_number", "description"]), opening_balance: Number(treasury.balance ?? 0) });
    },

    // Update treasury
    updateTreasury: async (id: number, updates: Partial<Treasury>) => {
        return factoryCommand<Treasury>("update_treasury", { ...fields(updates, ["name", "type", "currency", "account_number", "description"]), id });
    },

    // Operations
    deposit: async (data: { treasury_id: number, amount: number, description: string }) => {
        await factoryCommand("record_financial_transaction", { ...data, type: "income", category: "manual_deposit" });
    },

    withdraw: async (data: { treasury_id: number, amount: number, description: string }) => {
        await factoryCommand("record_financial_transaction", { ...data, type: "expense", category: "manual_withdraw" });
    },

    transfer: async (data: { from_id: number, to_id: number, amount: number, description: string }) => {
        await factoryCommand("transfer_treasury", data);
    },

    // Unified Transaction Entry (Receipts/Payments with Party Link)
    addTransaction: async (data: {
        treasury_id: number,
        date?: string,
        amount: number,
        type: 'income' | 'expense',
        category: string,
        description: string,
        party_id?: string | null,
        invoice_id?: number | null,
        invoice_type?: 'purchase' | 'sales' | null
    }) => {
        await factoryCommand("record_financial_transaction", Object.fromEntries(Object.entries(data).filter(([, value]) => value != null)));
    }
};
