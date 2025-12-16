import { forwardRef } from 'react';
import { format } from 'date-fns';
import { formatCurrency, formatNumber } from '@/lib/utils';

// Company Info
const COMPANY_INFO = {
    name: 'ديلايت لمستحضرات التجميل',
    nameEn: 'Delight Cosmetics',
    address: 'المنطقة الصناعية - مصر',
    phone: '01xxxxxxxxx'
};

interface OrderItem {
    name: string;
    quantity: number;
    unit?: string;
    unit_cost?: number;
    total_cost?: number;
}

interface ProductionOrderData {
    code: string;
    date: string;
    status: 'pending' | 'inProgress' | 'completed' | 'cancelled';
    items: OrderItem[];
    notes?: string;
    totalCost?: number;
    type: 'production' | 'packaging';
}

interface ProductionOrderPrintTemplateProps {
    data: ProductionOrderData;
}

const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
        'pending': 'معلق',
        'inProgress': 'قيد التنفيذ',
        'completed': 'مكتمل',
        'cancelled': 'ملغي'
    };
    return labels[status] || status;
};

const ProductionOrderPrintTemplate = forwardRef<HTMLDivElement, ProductionOrderPrintTemplateProps>(
    ({ data }, ref) => {
        const printDate = format(new Date(), 'dd/MM/yyyy HH:mm');
        const orderDate = format(new Date(data.date), 'dd/MM/yyyy');
        const isProduction = data.type === 'production';
        const totalCost = data.totalCost || data.items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
        const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);

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
                        <h2 className="text-3xl font-bold text-gray-800">
                            {isProduction ? 'أمر إنتاج' : 'أمر تعبئة'}
                        </h2>
                        <p className="text-lg font-mono font-bold mt-1">#{data.code}</p>
                    </div>

                    {/* Order Status */}
                    <div className="text-left">
                        <div className={`inline-block px-4 py-2 rounded-lg text-lg font-bold ${data.status === 'completed' ? 'bg-green-100 text-green-800' :
                                data.status === 'inProgress' ? 'bg-blue-100 text-blue-800' :
                                    data.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                        'bg-amber-100 text-amber-800'
                            }`}>
                            {getStatusLabel(data.status)}
                        </div>
                    </div>
                </div>

                {/* Order Info */}
                <div className="grid grid-cols-3 gap-6 mb-6">
                    <div className="border rounded-lg p-4 bg-gray-50 text-center">
                        <p className="text-sm text-gray-600 mb-1">تاريخ الأمر</p>
                        <p className="text-xl font-mono font-bold">{orderDate}</p>
                    </div>
                    <div className="border rounded-lg p-4 bg-gray-50 text-center">
                        <p className="text-sm text-gray-600 mb-1">عدد الأصناف</p>
                        <p className="text-xl font-mono font-bold">{data.items.length}</p>
                    </div>
                    <div className="border rounded-lg p-4 bg-gray-50 text-center">
                        <p className="text-sm text-gray-600 mb-1">إجمالي الكميات</p>
                        <p className="text-xl font-mono font-bold">{formatNumber(totalQuantity)}</p>
                    </div>
                </div>

                {/* Items Table */}
                <table className="w-full border-collapse mb-6">
                    <thead>
                        <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-600 p-2 text-center w-12">#</th>
                            <th className="border border-gray-600 p-2 text-right">{isProduction ? 'المنتج' : 'الصنف'}</th>
                            <th className="border border-gray-600 p-2 text-center w-24">الكمية</th>
                            <th className="border border-gray-600 p-2 text-center w-20">الوحدة</th>
                            <th className="border border-gray-600 p-2 text-center w-28">تكلفة الوحدة</th>
                            <th className="border border-gray-600 p-2 text-center w-32">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-300 p-2 text-center font-mono">{index + 1}</td>
                                <td className="border border-gray-300 p-2 font-medium">{item.name}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono font-bold">{formatNumber(item.quantity)}</td>
                                <td className="border border-gray-300 p-2 text-center">{item.unit || '-'}</td>
                                <td className="border border-gray-300 p-2 text-center font-mono">
                                    {item.unit_cost ? formatCurrency(item.unit_cost) : '-'}
                                </td>
                                <td className="border border-gray-300 p-2 text-center font-mono font-bold">
                                    {item.total_cost ? formatCurrency(item.total_cost) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-gray-200 font-bold">
                            <td colSpan={2} className="border border-gray-400 p-2 text-center">الإجمالي</td>
                            <td className="border border-gray-400 p-2 text-center font-mono">{formatNumber(totalQuantity)}</td>
                            <td className="border border-gray-400 p-2"></td>
                            <td className="border border-gray-400 p-2"></td>
                            <td className="border border-gray-400 p-2 text-center font-mono text-lg bg-orange-100">
                                {formatCurrency(totalCost)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

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
                        <p className="font-medium">مسؤول {isProduction ? 'الإنتاج' : 'التعبئة'}</p>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">مراقب الجودة</p>
                    </div>
                    <div className="text-center">
                        <div className="h-16 border-b border-gray-400 mb-2"></div>
                        <p className="font-medium">مدير المصنع</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
                    <p>تم الطباعة بتاريخ {printDate} | {COMPANY_INFO.name} - نظام إدارة المصنع</p>
                </div>
            </div>
        );
    }
);

ProductionOrderPrintTemplate.displayName = 'ProductionOrderPrintTemplate';

export default ProductionOrderPrintTemplate;
export type { ProductionOrderData, OrderItem };
