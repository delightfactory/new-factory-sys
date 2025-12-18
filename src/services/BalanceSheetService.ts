import { supabase } from "@/integrations/supabase/client";

/**
 * الميزان المالي للمصنع - Financial Balance Sheet Service
 * يحسب صافي المركز المالي الحقيقي للمصنع
 * 
 * صافي المركز المالي = الأصول - الالتزامات
 * 
 * الأصول (لنا):
 * ├── قيمة المخزون الحالي (جميع الأنواع × سعر التكلفة)
 * ├── أرصدة الخزائن (نقدي + بنكي)
 * └── مديونية العملاء لنا (الأرصدة الموجبة للعملاء)
 * 
 * الالتزامات (علينا):
 * └── مديونيتنا للموردين (الأرصدة السالبة للموردين)
 */

export interface InventoryBreakdown {
    type: 'raw' | 'packaging' | 'semi' | 'finished';
    typeLabel: string;
    count: number;
    value: number;
}

export interface TreasuryBreakdown {
    id: number;
    name: string;
    type: 'cash' | 'bank';
    balance: number;
}

export interface PartyBalance {
    id: string;
    name: string;
    type: 'customer' | 'supplier';
    balance: number;
    phone?: string;
}

export interface BalanceSheetData {
    // الأصول (Assets)
    assets: {
        inventory: number;          // إجمالي قيمة المخزون
        cash: number;               // أرصدة الخزائن
        receivables: number;        // مديونية العملاء لنا (ما لنا عند العملاء)
        total: number;              // إجمالي الأصول
    };

    // الالتزامات (Liabilities)
    liabilities: {
        payables: number;           // مديونيتنا للموردين (ما علينا للموردين)
        total: number;              // إجمالي الالتزامات
    };

    // صافي المركز المالي
    netPosition: number;            // الأصول - الالتزامات
    coverageRatio: number;          // نسبة التغطية (الأصول / الالتزامات)

    // التفاصيل
    inventoryBreakdown: InventoryBreakdown[];
    treasuryBreakdown: TreasuryBreakdown[];
    topReceivables: PartyBalance[]; // أكبر 5 عملاء مدينين لنا
    topPayables: PartyBalance[];    // أكبر 5 موردين ندين لهم

    // إحصائيات إضافية
    customersWithDebt: number;      // عدد العملاء المدينين
    suppliersWeOwe: number;         // عدد الموردين الدائنين

    // تاريخ التقرير
    generatedAt: string;
}

export const BalanceSheetService = {
    /**
     * جلب الميزان المالي الكامل
     */
    async getBalanceSheet(): Promise<BalanceSheetData> {
        // جلب البيانات بالتوازي لتحسين الأداء
        const [
            inventoryData,
            treasuriesData,
            partiesData
        ] = await Promise.all([
            this.getInventoryValuation(),
            this.getTreasuryBalances(),
            this.getPartiesBalances()
        ]);

        // حساب الأصول
        const inventoryTotal = inventoryData.reduce((sum, item) => sum + item.value, 0);
        const cashTotal = treasuriesData.reduce((sum, t) => sum + t.balance, 0);

        // العملاء المدينين لنا (رصيد موجب = يدينون لنا)
        const customersReceivables = partiesData
            .filter(p => p.type === 'customer' && p.balance > 0);
        const receivablesTotal = customersReceivables
            .reduce((sum, p) => sum + p.balance, 0);

        // الموردين الذين ندين لهم (رصيد سالب = ندين لهم)
        const suppliersPayables = partiesData
            .filter(p => p.type === 'supplier' && p.balance < 0);
        const payablesTotal = Math.abs(
            suppliersPayables.reduce((sum, p) => sum + p.balance, 0)
        );

        // حساب الإجماليات
        const totalAssets = inventoryTotal + cashTotal + receivablesTotal;
        const totalLiabilities = payablesTotal;
        const netPosition = totalAssets - totalLiabilities;
        const coverageRatio = totalLiabilities > 0
            ? (totalAssets / totalLiabilities) * 100
            : 100;

        // أكبر 5 عملاء مدينين (مرتبين تنازلياً)
        const topReceivables = customersReceivables
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5);

        // أكبر 5 موردين ندين لهم (مرتبين تنازلياً بالقيمة المطلقة)
        const topPayables = suppliersPayables
            .sort((a, b) => a.balance - b.balance) // الأكثر سلبية أولاً
            .slice(0, 5)
            .map(p => ({ ...p, balance: Math.abs(p.balance) })); // تحويل لقيمة موجبة للعرض

        return {
            assets: {
                inventory: inventoryTotal,
                cash: cashTotal,
                receivables: receivablesTotal,
                total: totalAssets
            },
            liabilities: {
                payables: payablesTotal,
                total: totalLiabilities
            },
            netPosition,
            coverageRatio: Math.round(coverageRatio),
            inventoryBreakdown: inventoryData,
            treasuryBreakdown: treasuriesData,
            topReceivables,
            topPayables,
            customersWithDebt: customersReceivables.length,
            suppliersWeOwe: suppliersPayables.length,
            generatedAt: new Date().toISOString()
        };
    },

    /**
     * حساب قيمة المخزون الإجمالية (كمية × تكلفة الوحدة)
     */
    async getInventoryValuation(): Promise<InventoryBreakdown[]> {
        const [raw, packaging, semi, finished] = await Promise.all([
            supabase.from('raw_materials').select('id, quantity, unit_cost'),
            supabase.from('packaging_materials').select('id, quantity, unit_cost'),
            supabase.from('semi_finished_products').select('id, quantity, unit_cost'),
            supabase.from('finished_products').select('id, quantity, unit_cost')
        ]);

        const calculate = (data: any[] | null) => {
            if (!data) return { count: 0, value: 0 };
            return {
                count: data.length,
                value: data.reduce((sum, item) =>
                    sum + ((item.quantity || 0) * (item.unit_cost || 0)), 0
                )
            };
        };

        const rawCalc = calculate(raw.data);
        const packagingCalc = calculate(packaging.data);
        const semiCalc = calculate(semi.data);
        const finishedCalc = calculate(finished.data);

        return [
            { type: 'raw', typeLabel: 'المواد الخام', ...rawCalc },
            { type: 'packaging', typeLabel: 'مواد التعبئة', ...packagingCalc },
            { type: 'semi', typeLabel: 'نصف المصنع', ...semiCalc },
            { type: 'finished', typeLabel: 'المنتجات التامة', ...finishedCalc }
        ];
    },

    /**
     * جلب أرصدة الخزائن
     */
    async getTreasuryBalances(): Promise<TreasuryBreakdown[]> {
        const { data, error } = await supabase
            .from('treasuries')
            .select('id, name, type, balance')
            .order('balance', { ascending: false });

        if (error) throw error;

        return (data || []).map(t => ({
            id: t.id,
            name: t.name,
            type: t.type as 'cash' | 'bank',
            balance: t.balance || 0
        }));
    },

    /**
     * جلب أرصدة العملاء والموردين
     * الرصيد الموجب للعميل = يدين لنا (مستحقات)
     * الرصيد السالب للمورد = ندين له (التزامات)
     */
    async getPartiesBalances(): Promise<PartyBalance[]> {
        const { data, error } = await supabase
            .from('parties')
            .select('id, name, type, balance, phone')
            .neq('balance', 0) // فقط من لديهم رصيد
            .order('balance', { ascending: false });

        if (error) throw error;

        return (data || []).map(p => ({
            id: p.id,
            name: p.name,
            type: p.type as 'customer' | 'supplier',
            balance: p.balance || 0,
            phone: p.phone
        }));
    },

    /**
     * جلب ملخص سريع للميزان (للـ Dashboard)
     */
    async getQuickSummary(): Promise<{
        netPosition: number;
        totalAssets: number;
        totalLiabilities: number;
        status: 'positive' | 'negative' | 'balanced';
    }> {
        const data = await this.getBalanceSheet();

        let status: 'positive' | 'negative' | 'balanced' = 'balanced';
        if (data.netPosition > 0) status = 'positive';
        else if (data.netPosition < 0) status = 'negative';

        return {
            netPosition: data.netPosition,
            totalAssets: data.assets.total,
            totalLiabilities: data.liabilities.total,
            status
        };
    }
};
