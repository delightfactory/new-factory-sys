import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    FileText,
    User,
    Calendar,
    Package,
    Banknote,
    CheckCircle,
    Clock,
    XCircle,
    Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';
import InvoicePrintTemplate from '@/components/print/templates/InvoicePrintTemplate';
import type { InvoiceData } from '@/components/print/templates/InvoicePrintTemplate';

interface Invoice {
    id: number;
    invoice_number: string;
    customer_id?: string;
    supplier_id?: string;
    total_amount: number;
    paid_amount: number;
    tax_amount: number;
    discount_amount: number;
    shipping_cost: number;
    transaction_date: string;
    status: string;
    notes?: string;
    created_at: string;
}

interface InvoiceItem {
    id: number;
    item_type: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    item_name?: string;
    finished_product_id?: number;
    semi_finished_product_id?: number;
    raw_material_id?: number;
    packaging_material_id?: number;
    finished_products?: { name: string };
    semi_finished_products?: { name: string };
    raw_materials?: { name: string };
    packaging_materials?: { name: string };
}

interface Party {
    id: string;
    name: string;
    type: string;
}

const STATUS_CONFIG = {
    draft: { label: 'مسودة', icon: Clock, color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' },
    posted: { label: 'مُعتمدة', icon: CheckCircle, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
    void: { label: 'ملغاة', icon: XCircle, color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
};

export default function InvoiceDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine invoice type from URL
    const isSales = location.pathname.includes('/selling');
    const tableName = isSales ? 'sales_invoices' : 'purchase_invoices';
    const itemsTable = isSales ? 'sales_invoice_items' : 'purchase_invoice_items';
    const partyField = isSales ? 'customer_id' : 'supplier_id';
    const typeLabel = isSales ? 'فاتورة بيع' : 'فاتورة شراء';

    // Fetch invoice details
    const { data: invoice, isLoading } = useQuery({
        queryKey: ['invoice', tableName, id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data as Invoice;
        },
        enabled: !!id
    });

    // Fetch party info
    const { data: party } = useQuery({
        queryKey: ['invoice-party', invoice?.[partyField as keyof Invoice]],
        queryFn: async () => {
            const partyId = invoice?.[partyField as keyof Invoice];
            if (!partyId) return null;
            const { data } = await supabase
                .from('parties')
                .select('id, name, type')
                .eq('id', partyId)
                .single();
            return data as Party | null;
        },
        enabled: !!invoice
    });

    // Fetch invoice items with product name joins
    const { data: items } = useQuery({
        queryKey: ['invoice-items', itemsTable, id],
        queryFn: async () => {
            const { data } = await supabase
                .from(itemsTable)
                .select(`
                    *,
                    finished_products:finished_product_id(name),
                    semi_finished_products:semi_finished_product_id(name),
                    raw_materials:raw_material_id(name),
                    packaging_materials:packaging_material_id(name)
                `)
                .eq('invoice_id', Number(id));
            return data as InvoiceItem[] || [];
        },
        enabled: !!id
    });

    // Print setup - MUST be before any conditional returns
    const printRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: invoice ? `Invoice-${invoice.invoice_number}` : 'Invoice',
    });

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="h-16 bg-muted/30 rounded-lg animate-pulse" />
                <CardGridSkeleton count={3} />
            </div>
        );
    }

    if (!invoice) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">الفاتورة غير موجودة</p>
                <Button onClick={() => navigate(-1)} className="mt-4">
                    <ArrowLeft className="ml-2 h-4 w-4" /> عودة
                </Button>
            </div>
        );
    }

    const statusConfig = STATUS_CONFIG[invoice.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
    const StatusIcon = statusConfig.icon;
    const remaining = invoice.total_amount - invoice.paid_amount;
    const paymentProgress = invoice.total_amount > 0 ? (invoice.paid_amount / invoice.total_amount) * 100 : 0;

    // Prepare print data
    const printData: InvoiceData = {
        invoice_number: invoice.invoice_number,
        transaction_date: invoice.transaction_date,
        party_name: party?.name || 'غير محدد',
        items: (items || []).map(item => {
            // Get item name from the appropriate joined table
            const itemName = item.finished_products?.name
                || item.semi_finished_products?.name
                || item.raw_materials?.name
                || item.packaging_materials?.name
                || item.item_name
                || '-';
            return {
                item_name: itemName,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price,
                item_type: item.item_type
            };
        }),
        total_amount: invoice.total_amount,
        discount_amount: invoice.discount_amount,
        tax_amount: invoice.tax_amount,
        shipping_cost: invoice.shipping_cost,
        paid_amount: invoice.paid_amount,
        notes: invoice.notes,
        type: isSales ? 'sales' : 'purchase'
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${isSales ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                            <FileText className={`h-6 w-6 ${isSales ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold font-mono">{invoice.invoice_number}</h1>
                            <Badge variant="outline">{typeLabel}</Badge>
                        </div>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${statusConfig.color}`}>
                    <StatusIcon className="h-5 w-5" />
                    <span className="font-medium">{statusConfig.label}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handlePrint()} className="gap-2">
                    <Printer className="h-4 w-4" />
                    طباعة الفاتورة
                </Button>
            </div>

            {/* Hidden Print Template */}
            <div style={{ display: 'none' }}>
                <InvoicePrintTemplate ref={printRef} data={printData} />
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Party Card */}
                <Card className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => party && navigate(`/commercial/parties/${party.id}`)}>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{isSales ? 'العميل' : 'المورد'}</p>
                            <p className="font-bold text-lg">{party?.name || 'غير محدد'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Date Card */}
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                            <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">تاريخ الفاتورة</p>
                            <p className="font-bold text-lg">{format(new Date(invoice.transaction_date), 'dd/MM/yyyy')}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Financial Summary */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Banknote className="h-5 w-5" />
                        الملخص المالي
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <p className="text-sm text-muted-foreground">الإجمالي</p>
                            <p className="text-xl font-bold">{invoice.total_amount.toLocaleString()} ج.م</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">المدفوع</p>
                            <p className="text-xl font-bold text-green-600 dark:text-green-400">{invoice.paid_amount.toLocaleString()} ج.م</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">المتبقي</p>
                            <p className={`text-xl font-bold ${remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600'}`}>
                                {remaining.toLocaleString()} ج.م
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">نسبة السداد</p>
                            <p className="text-xl font-bold">{paymentProgress.toFixed(0)}%</p>
                        </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 dark:bg-green-400 transition-all duration-300"
                            style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                        />
                    </div>
                    {/* Extra charges */}
                    {(invoice.tax_amount || invoice.discount_amount || invoice.shipping_cost) && (
                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-sm">
                            {invoice.tax_amount > 0 && (
                                <div><span className="text-muted-foreground">الضريبة:</span> {invoice.tax_amount.toLocaleString()} ج.م</div>
                            )}
                            {invoice.discount_amount > 0 && (
                                <div><span className="text-muted-foreground">الخصم:</span> {invoice.discount_amount.toLocaleString()} ج.م</div>
                            )}
                            {invoice.shipping_cost > 0 && (
                                <div><span className="text-muted-foreground">الشحن:</span> {invoice.shipping_cost.toLocaleString()} ج.م</div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Invoice Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        بنود الفاتورة ({items?.length || 0})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {items && items.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>الصنف</TableHead>
                                        <TableHead>النوع</TableHead>
                                        <TableHead>الكمية</TableHead>
                                        <TableHead>سعر الوحدة</TableHead>
                                        <TableHead>الإجمالي</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell className="font-medium">{item.item_name || '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {item.item_type === 'finished_product' ? 'منتج' :
                                                        item.item_type === 'raw_material' ? 'خامة' : item.item_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>{item.unit_price.toLocaleString()}</TableCell>
                                            <TableCell className="font-bold">{item.total_price.toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-muted-foreground">
                            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>لا توجد بنود</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Notes */}
            {invoice.notes && (
                <Card>
                    <CardHeader>
                        <CardTitle>ملاحظات</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">{invoice.notes}</p>
                    </CardContent>
                </Card>
            )}

            {/* Meta info */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>تاريخ الإنشاء: {format(new Date(invoice.created_at), 'dd/MM/yyyy HH:mm')}</span>
            </div>
        </div>
    );
}
