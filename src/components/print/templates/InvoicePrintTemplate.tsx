import { forwardRef } from 'react';
import { format } from 'date-fns';
import { formatCurrency, formatNumber } from '@/lib/utils';

// Company Info - Can be moved to a config file later
const COMPANY_INFO = {
    name: 'ديلايت لمستحضرات التجميل',
    nameEn: 'Delight Cosmetics',
    address: 'المنطقة الصناعية - مصر',
    phone: '01xxxxxxxxx',
    taxId: 'الرقم الضريبي: xxx-xxx-xxx',
    commercialReg: 'السجل التجاري: xxxxx'
};

interface InvoiceItem {
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_type?: string;
}

interface InvoiceData {
    invoice_number: string;
    transaction_date: string;
    party_name: string;
    party_address?: string;
    party_phone?: string;
    items: InvoiceItem[];
    total_amount: number;
    discount_amount?: number;
    tax_amount?: number;
    shipping_cost?: number;
    paid_amount: number;
    notes?: string;
    type: 'sales' | 'purchase';
}

interface InvoicePrintTemplateProps {
    data: InvoiceData;
}

const InvoicePrintTemplate = forwardRef<HTMLDivElement, InvoicePrintTemplateProps>(
    ({ data }, ref) => {
        const remaining = data.total_amount - data.paid_amount;
        const isSales = data.type === 'sales';
        const printDate = format(new Date(), 'dd/MM/yyyy HH:mm');
        const invoiceDate = format(new Date(data.transaction_date), 'dd/MM/yyyy');

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

                    {/* Invoice Title */}
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-gray-800">
                            {isSales ? 'فاتورة بيع' : 'فاتورة شراء'}
                        </h2>
                        <p className="text-lg font-mono font-bold mt-1">{data.invoice_number}</p>
                    </div>

                    {/* Company Info */}
                    <div className="text-left text-sm text-gray-600">
                        <p>{COMPANY_INFO.address}</p>
                        <p>هاتف: {COMPANY_INFO.phone}</p>
                        <p>{COMPANY_INFO.taxId}</p>
                    </div>
                </div>

                {/* Invoice Meta & Party Info */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                    {/* Party Info */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="font-bold text-gray-700 mb-2">{isSales ? 'بيانات العميل' : 'بيانات المورد'}</h3>
                        <p className="text-lg font-bold">{data.party_name}</p>
                        {data.party_address && <p className="text-sm text-gray-600">{data.party_address}</p>}
                        {data.party_phone && <p className="text-sm text-gray-600">هاتف: {data.party_phone}</p>}
                    </div>

                    {/* Invoice Details */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <h3 className="font-bold text-gray-700 mb-2">بيانات الفاتورة</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <span className="text-gray-600">التاريخ:</span>
                            <span className="font-mono font-bold">{invoiceDate}</span>
                            <span className="text-gray-600">رقم الفاتورة:</span>
                            <span className="font-mono font-bold">{data.invoice_number}</span>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <table className="w-full border-collapse mb-6">
                    <thead>
                        <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-600 p-2 text-center w-12">#</th>
                            <th className="border border-gray-600 p-2 text-right">الصنف</th>
                            <th className="border border-gray-600 p-2 text-center w-24">الكمية</th>
                            <th className="border border-gray-600 p-2 text-center w-28">السعر</th>
                            <th className="border border-gray-600 p-2 text-center w-32">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-300 p-2 text-center font-mono">{index + 1}</td>
                                <td className="border border-gray-300 p-2 font-medium">{item.item_name}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono">{formatNumber(item.quantity)}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono">{formatCurrency(item.unit_price)}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono font-bold">{formatCurrency(item.total_price)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Financial Summary */}
                <div className="flex justify-end mb-8">
                    <div className="w-72 border rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 flex justify-between">
                            <span>إجمالي البنود:</span>
                            <span className="font-mono">{formatCurrency(data.total_amount - (data.tax_amount || 0) + (data.discount_amount || 0) - (data.shipping_cost || 0))}</span>
                        </div>
                        {data.discount_amount && data.discount_amount > 0 && (
                            <div className="px-4 py-2 flex justify-between text-green-700">
                                <span>الخصم:</span>
                                <span className="font-mono">- {formatCurrency(data.discount_amount)}</span>
                            </div>
                        )}
                        {data.tax_amount && data.tax_amount > 0 && (
                            <div className="px-4 py-2 flex justify-between">
                                <span>الضريبة:</span>
                                <span className="font-mono">+ {formatCurrency(data.tax_amount)}</span>
                            </div>
                        )}
                        {data.shipping_cost && data.shipping_cost > 0 && (
                            <div className="px-4 py-2 flex justify-between">
                                <span>الشحن:</span>
                                <span className="font-mono">+ {formatCurrency(data.shipping_cost)}</span>
                            </div>
                        )}
                        <div className="bg-gray-800 text-white px-4 py-3 flex justify-between font-bold">
                            <span>الإجمالي:</span>
                            <span className="font-mono text-lg">{formatCurrency(data.total_amount)}</span>
                        </div>
                        <div className="px-4 py-2 flex justify-between text-green-700">
                            <span>المدفوع:</span>
                            <span className="font-mono font-bold">{formatCurrency(data.paid_amount)}</span>
                        </div>
                        <div className={`px-4 py-2 flex justify-between font-bold ${remaining > 0 ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50'}`}>
                            <span>المتبقي:</span>
                            <span className="font-mono">{formatCurrency(remaining)}</span>
                        </div>
                    </div>
                </div>

                {/* Notes */}
                {data.notes && (
                    <div className="border rounded-lg p-4 mb-8 bg-yellow-50">
                        <h3 className="font-bold text-gray-700 mb-2">ملاحظات:</h3>
                        <p className="text-gray-600">{data.notes}</p>
                    </div>
                )}

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-8 mt-12 pt-8 border-t">
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">المستلم</p>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">المحاسب</p>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">المدير المالي</p>
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

InvoicePrintTemplate.displayName = 'InvoicePrintTemplate';

export default InvoicePrintTemplate;
export type { InvoiceData, InvoiceItem };
