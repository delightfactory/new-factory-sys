import {supabase} from '@/integrations/supabase/client';
import {readCompleteRows} from '@/platform/data/read-complete-rows';
import {summarizeCategoryUsage, type FinancialCategory, type CategoryMovement, type FinancialCategoryType} from '@/features/financial/category-policy';
export async function readFinancialCategories(type?: FinancialCategoryType) {
    return readCompleteRows(async (from,to)=>{
        let query=supabase.from('financial_categories').select('id,name,type,is_system',{count:'exact'}).order('id').range(from,to);
        if(type)query=query.eq('type',type);
        const {data,count,error}=await query.returns<FinancialCategory[]>();return {rows:data,count,error};
    },'FINANCIAL_CATEGORIES');
}
export async function readCategoryUsage() {
    const rows=await readCompleteRows(async(from,to)=>{
        const {data,count,error}=await supabase.from('financial_transactions').select('id,category,transaction_type,amount::text',{count:'exact'}).in('transaction_type',['income','expense']).order('id').range(from,to).returns<CategoryMovement[]>();
        return {rows:data,count,error};
    },'CATEGORY_USAGE');
    return summarizeCategoryUsage(rows);
}
