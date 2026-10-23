import Decimal from 'decimal.js-light';
export type FinancialCategoryType = 'income' | 'expense';
export interface FinancialCategory {id: number; name: string; type: FinancialCategoryType; is_system: boolean | null}
export interface CategoryMovement {id: number; category: string; transaction_type: string; amount: string}
export interface CategoryUsage {name: string; type: FinancialCategoryType; count: number; amount: string}
const Money = Decimal.clone({precision:40});
export function summarizeCategoryUsage(rows: CategoryMovement[]): CategoryUsage[] {
    const groups = new Map<string,CategoryUsage>();
    for (const row of rows) {
        if (row.transaction_type !== 'income' && row.transaction_type !== 'expense') continue;
        if (typeof row.amount !== 'string' || !row.amount.trim() || typeof row.category !== 'string') throw Error('CATEGORY_USAGE_INVALID');
        let value: Decimal;
        try {value = new Money(row.amount);} catch {throw Error('CATEGORY_USAGE_INVALID');}
        const key=JSON.stringify([row.transaction_type,row.category]);
        const group=groups.get(key)??{name:row.category,type:row.transaction_type,count:0,amount:'0'};
        group.count++;group.amount=new Money(group.amount).plus(value).toFixed();groups.set(key,group);
    }
    return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
const LEGACY: Record<FinancialCategoryType,{value:string;label:string}[]> = {
    income:[{value:'receipt',label:'تحصيل من عميل'},{value:'sales',label:'إيراد مبيعات'},{value:'refund',label:'استرداد'},{value:'other_income',label:'إيراد آخر'}],
    expense:[{value:'payment',label:'سداد مورد'},{value:'purchase',label:'مشتريات'},{value:'salary',label:'رواتب'},{value:'rent',label:'إيجار'},{value:'utilities',label:'مرافق (كهرباء/ماء/غاز)'},{value:'maintenance',label:'صيانة'},{value:'transport',label:'نقل وشحن'},{value:'other_expense',label:'مصروف آخر'}],
};
export function paymentCategoryOptions(type: FinancialCategoryType, categories: FinancialCategory[], verified=true) {
    const names=new Set(categories.filter(row=>row.type===type).map(row=>row.name));
    const existing=LEGACY[type].map(option=>({...option,description:!verified?'لم يُتأكد بعد من إعداد هذا البند في الأرباح والخسائر':names.has(option.value)?'بند معدّ؛ يدخل في الأرباح والخسائر حسب القاعدة الحالية':'بند السند الأصلي؛ غير معدّ في الأرباح والخسائر'}));
    const keys=new Set(existing.map(option=>option.value));
    return [...existing,...[...names].filter(name=>!keys.has(name)).map(name=>({value:name,label:name,description:'بند معدّ؛ يدخل في الأرباح والخسائر حسب القاعدة الحالية'}))];
}
