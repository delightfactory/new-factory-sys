import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Route, Package, FlaskConical, Box, ShoppingCart, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

interface ProductJourney {
    id: number;
    name: string;
    code: string;
    // Semi-finished info
    semiFinished: { id: number; name: string; cost: number } | null;
    // Raw materials used
    rawMaterials: { name: string; percentage: number; unitCost: number }[];
    // Packaging materials
    packagingMaterials: { name: string; quantity: number; unitCost: number }[];
    // Production orders
    productionOrders: { id: number; date: string; quantity: number; status: string }[];
    // Packaging orders
    packagingOrders: { id: number; date: string; quantity: number; status: string }[];
    // Sales
    salesInvoices: { id: number; date: string; quantity: number; unitPrice: number; customer: string }[];
    // Cost progression
    rawMaterialCostPerUnit: number;
    semiFinishedCostPerUnit: number;
    finishedCostPerUnit: number;
    salesPricePerUnit: number;
    totalProduced: number;
    totalSold: number;
    totalRevenue: number;
}

export default function ProductJourneyReport() {
    const [selectedProductId, setSelectedProductId] = useState<string>('');

    const { data: productsList } = useQuery({
        queryKey: ['journey-products-list'],
        queryFn: async () => {
            const { data } = await supabase.from('finished_products').select('id, name, code').order('name');
            return data || [];
        }
    });

    const { data: journey, isLoading } = useQuery({
        queryKey: ['product-journey', selectedProductId],
        queryFn: async (): Promise<ProductJourney | null> => {
            if (!selectedProductId) return null;
            const productId = Number(selectedProductId);

            // Get finished product
            const { data: fp } = await supabase
                .from('finished_products')
                .select('*, semi_finished:semi_finished_products(id, name, unit_cost)')
                .eq('id', productId)
                .single();

            if (!fp) return null;

            // Get raw materials through semi-finished recipe
            let rawMaterials: ProductJourney['rawMaterials'] = [];
            let rawMaterialCostPerUnit = 0;
            if (fp.semi_finished_id) {
                const { data: ingredients } = await supabase
                    .from('semi_finished_ingredients')
                    .select('percentage, raw_material:raw_materials(name, unit_cost)')
                    .eq('semi_finished_id', fp.semi_finished_id);

                rawMaterials = (ingredients || []).map((i: any) => ({
                    name: i.raw_material?.name || '-',
                    percentage: i.percentage,
                    unitCost: i.raw_material?.unit_cost || 0
                }));
                rawMaterialCostPerUnit = rawMaterials.reduce((s, r) => s + (r.unitCost * r.percentage / 100), 0);
            }

            // Get packaging materials
            const { data: packaging } = await supabase
                .from('finished_product_packaging')
                .select('quantity, packaging_material:packaging_materials(name, unit_cost)')
                .eq('finished_product_id', productId);

            const packagingMaterials = (packaging || []).map((p: any) => ({
                name: p.packaging_material?.name || '-',
                quantity: p.quantity,
                unitCost: p.packaging_material?.unit_cost || 0
            }));

            // Get production orders involving this product's semi-finished
            let productionOrders: ProductJourney['productionOrders'] = [];
            if (fp.semi_finished_id) {
                const { data: prodItems } = await supabase
                    .from('production_order_items')
                    .select('production_order_id, quantity, production_orders(created_at, status)')
                    .eq('semi_finished_id', fp.semi_finished_id)
                    .order('production_order_id', { ascending: false })
                    .limit(10);

                productionOrders = (prodItems || []).map((item: any) => ({
                    id: item.production_order_id,
                    date: item.production_orders?.created_at?.split('T')[0] || '-',
                    quantity: item.quantity,
                    status: item.production_orders?.status || 'unknown'
                }));
            }

            // Get packaging orders
            const { data: pkgOrders } = await supabase
                .from('packaging_order_items')
                .select('packaging_order_id, quantity, packaging_orders(created_at, status)')
                .eq('finished_product_id', productId)
                .order('packaging_order_id', { ascending: false })
                .limit(10);

            const packagingOrders = (pkgOrders || []).map((item: any) => ({
                id: item.packaging_order_id,
                date: item.packaging_orders?.created_at?.split('T')[0] || '-',
                quantity: item.quantity,
                status: item.packaging_orders?.status || 'unknown'
            }));

            // Get sales invoices
            const { data: salesItems } = await supabase
                .from('sales_invoice_items')
                .select('quantity, unit_price, sales_invoices(transaction_date, party:parties(name))')
                .eq('finished_product_id', productId)
                .order('id', { ascending: false })
                .limit(10);

            const salesInvoices = (salesItems || []).map((item: any) => ({
                id: item.id,
                date: item.sales_invoices?.transaction_date || '-',
                quantity: item.quantity,
                unitPrice: item.unit_price,
                customer: item.sales_invoices?.party?.name || '-'
            }));

            const totalProduced = packagingOrders.filter(o => o.status === 'completed').reduce((s, o) => s + o.quantity, 0);
            const totalSold = salesInvoices.reduce((s, i) => s + i.quantity, 0);
            const totalRevenue = salesInvoices.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);

            const sfData = fp.semi_finished as any;

            return {
                id: fp.id,
                name: fp.name,
                code: fp.code,
                semiFinished: sfData ? { id: sfData.id, name: sfData.name, cost: sfData.unit_cost || 0 } : null,
                rawMaterials,
                packagingMaterials,
                productionOrders,
                packagingOrders,
                salesInvoices,
                rawMaterialCostPerUnit,
                semiFinishedCostPerUnit: sfData?.unit_cost || 0,
                finishedCostPerUnit: fp.unit_cost || 0,
                salesPricePerUnit: fp.sales_price || 0,
                totalProduced,
                totalSold,
                totalRevenue
            };
        },
        enabled: !!selectedProductId
    });

    const statusLabel = (s: string) => {
        switch (s) {
            case 'completed': return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">مكتمل</Badge>;
            case 'pending': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">قيد الانتظار</Badge>;
            case 'in_progress': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">جاري</Badge>;
            default: return <Badge variant="outline">{s}</Badge>;
        }
    };

    const costStages = journey ? [
        { label: 'مواد خام', cost: journey.rawMaterialCostPerUnit, color: 'bg-amber-500', icon: FlaskConical },
        { label: 'نصف مصنع', cost: journey.semiFinishedCostPerUnit, color: 'bg-blue-500', icon: Package },
        { label: 'منتج تام', cost: journey.finishedCostPerUnit, color: 'bg-emerald-500', icon: Box },
        { label: 'سعر البيع', cost: journey.salesPricePerUnit, color: 'bg-purple-500', icon: ShoppingCart },
    ] : [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader title="رحلة المنتج" description="تتبع حركة المنتج من المادة الخام حتى البيع مع التكلفة في كل مرحلة" icon={Route} />
                </div>
                <div className="flex gap-2 items-center">
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger className="w-[250px]"><SelectValue placeholder="اختر منتج..." /></SelectTrigger>
                        <SelectContent>
                            {productsList?.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.code})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <PrintButton />
                </div>
            </div>

            {!selectedProductId && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Route className="w-12 h-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">اختر منتجاً لعرض رحلته</p>
                        <p className="text-sm">تتبع المنتج من الخامات حتى البيع</p>
                    </CardContent>
                </Card>
            )}

            {isLoading && <CardGridSkeleton count={3} />}

            {journey && (
                <div className="space-y-6">
                    {/* Cost Progression Bar */}
                    <Card>
                        <CardHeader><CardTitle>سلسلة القيمة — تطور التكلفة</CardTitle></CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                {costStages.map((stage, i) => (
                                    <div key={stage.label} className="flex items-center">
                                        <div className="flex flex-col items-center min-w-[120px]">
                                            <div className={`w-12 h-12 ${stage.color} rounded-full flex items-center justify-center text-white mb-2`}>
                                                <stage.icon className="w-6 h-6" />
                                            </div>
                                            <span className="text-xs text-muted-foreground">{stage.label}</span>
                                            <span className="font-bold text-sm mt-1">{formatCurrency(stage.cost)}</span>
                                        </div>
                                        {i < costStages.length - 1 && (
                                            <ChevronLeft className="w-6 h-6 text-muted-foreground mx-1 flex-shrink-0" />
                                        )}
                                    </div>
                                ))}
                            </div>
                            {journey.salesPricePerUnit > 0 && (
                                <div className="mt-4 p-3 bg-muted/50 rounded-lg text-center">
                                    <span className="text-sm text-muted-foreground">هامش الربح: </span>
                                    <span className={`font-bold ${journey.salesPricePerUnit > journey.finishedCostPerUnit ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {formatCurrency(journey.salesPricePerUnit - journey.finishedCostPerUnit)}
                                        ({formatNumber(((journey.salesPricePerUnit - journey.finishedCostPerUnit) / journey.salesPricePerUnit) * 100)}%)
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Summary Stats */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي الإنتاج</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{formatNumber(journey.totalProduced)} وحدة</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي المبيعات</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{formatNumber(journey.totalSold)} وحدة</div></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي الإيرادات</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-emerald-600">{formatCurrency(journey.totalRevenue)}</div></CardContent>
                        </Card>
                    </div>

                    {/* Raw Materials */}
                    {journey.rawMaterials.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-amber-500 rounded-full" />
                                    المرحلة 1: المواد الخام → {journey.semiFinished?.name || 'نصف مصنع'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {journey.rawMaterials.map((rm, i) => (
                                        <div key={i} className="flex justify-between p-2 bg-amber-50/50 dark:bg-amber-900/10 rounded">
                                            <span>{rm.name} ({rm.percentage}%)</span>
                                            <span className="font-mono text-sm">{formatCurrency(rm.unitCost)} / وحدة</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Production Orders */}
                                {journey.productionOrders.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">آخر أوامر الإنتاج:</h4>
                                        <div className="space-y-1">
                                            {journey.productionOrders.map(o => (
                                                <div key={o.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                                                    <span>أمر #{o.id} — {o.date}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span>{formatNumber(o.quantity)} وحدة</span>
                                                        {statusLabel(o.status)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Packaging Stage */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                                المرحلة 2: {journey.semiFinished?.name || 'نصف مصنع'} + تعبئة → {journey.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {journey.packagingMaterials.length > 0 && (
                                <div className="space-y-2 mb-4">
                                    <h4 className="text-sm font-semibold text-muted-foreground">مواد التعبئة:</h4>
                                    {journey.packagingMaterials.map((pm, i) => (
                                        <div key={i} className="flex justify-between p-2 bg-blue-50/50 dark:bg-blue-900/10 rounded">
                                            <span>{pm.name} (×{pm.quantity})</span>
                                            <span className="font-mono text-sm">{formatCurrency(pm.unitCost * pm.quantity)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {journey.packagingOrders.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">آخر أوامر التعبئة:</h4>
                                    <div className="space-y-1">
                                        {journey.packagingOrders.map(o => (
                                            <div key={o.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                                                <span>أمر #{o.id} — {o.date}</span>
                                                <div className="flex items-center gap-2">
                                                    <span>{formatNumber(o.quantity)} وحدة</span>
                                                    {statusLabel(o.status)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Sales Stage */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                                المرحلة 3: البيع
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {journey.salesInvoices.length > 0 ? (
                                <div className="space-y-2">
                                    {journey.salesInvoices.map(sale => (
                                        <div key={sale.id} className="flex items-center justify-between p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded">
                                            <div>
                                                <span className="text-sm">{sale.date}</span>
                                                <span className="text-muted-foreground text-sm mr-2">— {sale.customer}</span>
                                            </div>
                                            <div className="text-left">
                                                <span className="text-sm">{formatNumber(sale.quantity)} وحدة × {formatCurrency(sale.unitPrice)}</span>
                                                <span className="font-bold mr-2">= {formatCurrency(sale.quantity * sale.unitPrice)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">لا توجد مبيعات مسجلة لهذا المنتج</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
