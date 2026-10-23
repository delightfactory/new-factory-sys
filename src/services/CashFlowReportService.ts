import { supabase } from '@/integrations/supabase/client';
import { loadCashFlowSources, validCashPeriod, type CashFlowEntry, type CashFlowPeriod } from '@/features/reports/cash-flow';
export async function loadCashFlowReport(scope: CashFlowPeriod & { treasuryId: number | null }) {
    if (!validCashPeriod(scope)) throw Error('CASH_PERIOD_INVALID');
    if (scope.treasuryId !== null && (!Number.isSafeInteger(scope.treasuryId) || scope.treasuryId <= 0)) throw Error('CASH_TREASURY_INVALID');
    return loadCashFlowSources({
        entries: async (from, to) => {
            let query = supabase.from('financial_transactions').select('id,treasury_id,amount::text,transaction_type,category,description,transaction_date,created_at,party_id,invoice_id,invoice_type,reference_type,reference_id,party:parties(name)', { count: 'exact' })
                .gte('transaction_date', scope.from).lte('transaction_date', scope.to);
            if (scope.treasuryId !== null) query = query.eq('treasury_id', scope.treasuryId);
            const { data, count, error } = await query.order('transaction_date').order('created_at').order('id').range(from, to).returns<CashFlowEntry[]>();
            return { rows: data, count, error };
        },
        treasuries: async (from, to) => {
            const { data, count, error } = await supabase.from('treasuries').select('id,name,currency', { count: 'exact' }).order('id').range(from, to);
            return { rows: data, count, error };
        },
    });
}
