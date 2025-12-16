import { forwardRef } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

// Company Info
const COMPANY_INFO = {
    name: 'ديلايت لمستحضرات التجميل',
    nameEn: 'Delight Cosmetics',
    address: 'المنطقة الصناعية - مصر',
    phone: '01xxxxxxxxx',
    taxId: 'الرقم الضريبي: xxx-xxx-xxx',
    commercialReg: 'السجل التجاري: xxxxx'
};

interface LedgerEntry {
    id: string;
    transaction_date: string;
    reference_type: string;
    description: string;
    debit: number;
    credit: number;
}

interface PartyInfo {
    name: string;
    type: 'customer' | 'supplier';
    phone?: string;
    address?: string;
    balance: number;
}

interface StatementData {
    party: PartyInfo;
    entries: LedgerEntry[];
    dateFrom?: string;
    dateTo?: string;
}

interface StatementPrintTemplateProps {
    data: StatementData;
}

const getRefLabel = (refType: string): string => {
    const labels: Record<string, string> = {
        'sales_invoice': 'فاتورة بيع',
        'purchase_invoice': 'فاتورة شراء',
        'sales_return': 'مرتجع بيع',
        'purchase_return': 'مرتجع شراء',
        'payment': 'سداد',
        'receipt': 'تحصيل',
        'refund': 'استرداد',
        'expense': 'مصروف',
        'income': 'إيراد'
    };
    return labels[refType] || refType;
};

const StatementPrintTemplate = forwardRef<HTMLDivElement, StatementPrintTemplateProps>(
    ({ data }, ref) => {
        const printDate = format(new Date(), 'dd/MM/yyyy HH:mm');
        const isCustomer = data.party.type === 'customer';

        // Calculate running balance
        let runningBalance = 0;
        const entriesWithBalance = data.entries.map(entry => {
            runningBalance += entry.debit - entry.credit;
            return { ...entry, balance: runningBalance };
        });

        // Calculate totals
        const totalDebit = data.entries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = data.entries.reduce((sum, e) => sum + e.credit, 0);
        const finalBalance = totalDebit - totalCredit;

        return (
            <div ref={ref} className="p-8 bg-white text-black font-sans" dir="rtl" style={{ width: '210mm', minHeight: '297mm' }}>
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                    {/* Company Logo & Name */}
                    <div className="flex items-center gap-4">
                        <img src="/android-chrome-192x192.png" alt="Logo" className="w-16 h-16 rounded-lg" />
                        <div>
                            <h1 className="text-2xl font-bold">{COMPANY_INFO.name}</h1>
                            <p className="text-sm text-gray-600">{COMPANY_INFO.nameEn}</p>
                        </div>
                    </div>

                    {/* Document Title */}
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-gray-800">كشف حساب</h2>
                        <p className="text-lg text-gray-600 mt-1">Statement of Account</p>
                    </div>

                    {/* Company Info */}
                    <div className="text-left text-sm text-gray-600">
                        <p>{COMPANY_INFO.address}</p>
                        <p>هاتف: {COMPANY_INFO.phone}</p>
                        <p>{COMPANY_INFO.taxId}</p>
                    </div>
                </div>

                {/* Party & Period Info */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                    {/* Party Info */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="font-bold text-gray-700 mb-2">{isCustomer ? 'بيانات العميل' : 'بيانات المورد'}</h3>
                        <p className="text-xl font-bold">{data.party.name}</p>
                        {data.party.address && <p className="text-sm text-gray-600">{data.party.address}</p>}
                        {data.party.phone && <p className="text-sm text-gray-600">هاتف: {data.party.phone}</p>}
                    </div>

                    {/* Statement Info */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="font-bold text-gray-700 mb-2">بيانات الكشف</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-gray-600">تاريخ الطباعة:</span>
                            <span className="font-mono">{printDate}</span>
                            <span className="text-gray-600">عدد الحركات:</span>
                            <span className="font-mono">{data.entries.length}</span>
                            {data.dateFrom && (
                                <>
                                    <span className="text-gray-600">من تاريخ:</span>
                                    <span className="font-mono">{data.dateFrom}</span>
                                </>
                            )}
                            {data.dateTo && (
                                <>
                                    <span className="text-gray-600">إلى تاريخ:</span>
                                    <span className="font-mono">{data.dateTo}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Opening Balance Note */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                    <strong>ملاحظة:</strong> الرصيد الافتتاحي = 0. هذا الكشف يعرض جميع الحركات المسجلة في النظام.
                </div>

                {/* Ledger Table */}
                <table className="w-full border-collapse mb-6 text-sm">
                    <thead>
                        <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-600 p-2 text-center w-24">التاريخ</th>
                            <th className="border border-gray-600 p-2 text-center w-24">النوع</th>
                            <th className="border border-gray-600 p-2 text-right">البيان</th>
                            <th className="border border-gray-600 p-2 text-center w-28">مدين</th>
                            <th className="border border-gray-600 p-2 text-center w-28">دائن</th>
                            <th className="border border-gray-600 p-2 text-center w-32">الرصيد</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entriesWithBalance.map((entry, index) => (
                            <tr key={entry.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-300 p-2 text-center font-mono text-xs">
                                    {format(new Date(entry.transaction_date), 'dd/MM/yyyy')}
                                </td>
                                <td className="border border-gray-300 p-2 text-center">
                                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-200">
                                        {getRefLabel(entry.reference_type)}
                                    </span>
                                </td>
                                <td className="border border-gray-300 p-2">{entry.description || '-'}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono text-red-600">
                                    {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                                </td>
                                <td className="border border-gray-300 p-2 text-center font-mono text-green-600">
                                    {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                </td>
                                <td className={`border border-gray-300 p-2 text-center font-mono font-bold ${entry.balance >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                                    {formatCurrency(Math.abs(entry.balance))}
                                    <span className="text-xs mr-1">{entry.balance >= 0 ? 'مدين' : 'دائن'}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {/* Totals Footer */}
                    <tfoot>
                        <tr className="bg-gray-200 font-bold">
                            <td colSpan={3} className="border border-gray-400 p-2 text-center">الإجمالي</td>
                            <td className="border border-gray-400 p-2 text-center font-mono text-red-700">
                                {formatCurrency(totalDebit)}
                            </td>
                            <td className="border border-gray-400 p-2 text-center font-mono text-green-700">
                                {formatCurrency(totalCredit)}
                            </td>
                            <td className={`border border-gray-400 p-2 text-center font-mono ${finalBalance >= 0 ? 'text-red-700 bg-red-100' : 'text-green-700 bg-green-100'}`}>
                                {formatCurrency(Math.abs(finalBalance))}
                                <span className="text-xs mr-1">{finalBalance >= 0 ? 'مدين' : 'دائن'}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* Final Balance Summary */}
                <div className="flex justify-end mb-8">
                    <div className="w-80 border-2 rounded-lg overflow-hidden">
                        <div className={`px-4 py-4 text-center font-bold text-lg ${finalBalance >= 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            <p className="text-sm text-gray-600 mb-1">الرصيد النهائي</p>
                            <p className="text-2xl font-mono">
                                {formatCurrency(Math.abs(finalBalance))}
                                <span className="text-base mr-2">{finalBalance >= 0 ? 'مدين (مستحق علينا)' : 'دائن (مستحق لنا)'}</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t">
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">توقيع المحاسب</p>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">توقيع {isCustomer ? 'العميل' : 'المورد'}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
                    <p>تم الطباعة بتاريخ {printDate} | {COMPANY_INFO.name} - نظام إدارة المصنع</p>
                    <p className="mt-1">{COMPANY_INFO.commercialReg} | {COMPANY_INFO.taxId}</p>
                </div>
            </div>
        );
    }
);

StatementPrintTemplate.displayName = 'StatementPrintTemplate';

export default StatementPrintTemplate;
export type { StatementData, LedgerEntry, PartyInfo };
