import {supabase} from '@/integrations/supabase/client';
import {buildProfit, loadProfitSources, validProfitPeriod, type ProfitPeriod, type ProfitSources} from '@/features/reports/profit-ledger';
export async function readProfitReport(period: ProfitPeriod, includePurchases = false) {
    if (!validProfitPeriod(period)) throw Error('PROFIT_PERIOD_INVALID');
    const sales = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('sales_invoices').select('id,status,transaction_date,total_amount::text', {count: 'exact'}).eq('status', 'posted').gte('transaction_date', period.from).lte('transaction_date', period.to).order('id').range(from, to).returns<ProfitSources['sales']>();
        return {rows: data, count, error};
    };
    const returns = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('sales_returns').select('id,status,return_date,total_amount::text', {count: 'exact'}).eq('status', 'posted').gte('return_date', period.from).lte('return_date', period.to).order('id').range(from, to).returns<ProfitSources['returns']>();
        return {rows: data, count, error};
    };
    const finance = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('financial_transactions').select('id,transaction_date,transaction_type,category,amount::text', {count: 'exact'}).in('transaction_type', ['income', 'expense']).gte('transaction_date', period.from).lte('transaction_date', period.to).order('id').range(from, to).returns<ProfitSources['finance']>();
        return {rows: data, count, error};
    };
    const categories = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('financial_categories').select('id,name,type', {count: 'exact'}).order('id').range(from, to).returns<ProfitSources['categories']>();
        return {rows: data, count, error};
    };
    const salesCosts = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('sales_invoice_items').select('id,quantity::text,unit_cost_at_sale::text,sales_invoices!inner(status,transaction_date)', {count: 'exact'}).eq('sales_invoices.status', 'posted').gte('sales_invoices.transaction_date', period.from).lte('sales_invoices.transaction_date', period.to).order('id').range(from, to).returns<ProfitSources['salesCosts']>();
        return {rows: data, count, error};
    };
    const returnCosts = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('sales_return_items').select('id,quantity::text,unit_cost_at_return::text,sales_returns!inner(status,return_date)', {count: 'exact'}).eq('sales_returns.status', 'posted').gte('sales_returns.return_date', period.from).lte('sales_returns.return_date', period.to).order('id').range(from, to).returns<ProfitSources['returnCosts']>();
        return {rows: data, count, error};
    };
    const purchases = async (from: number, to: number) => {
        const {data, count, error} = await supabase.from('purchase_invoices').select('id,status,transaction_date,total_amount::text', {count: 'exact'}).eq('status', 'posted').gte('transaction_date', period.from).lte('transaction_date', period.to).order('id').range(from, to).returns<ProfitSources['purchases']>();
        return {rows: data, count, error};
    };
    const sources = await loadProfitSources({sales, returns, finance, categories, salesCosts, returnCosts, ...(includePurchases ? {purchases} : {})});
    return {...buildProfit(sources, period), capturedAt: new Date().toISOString()};
}

