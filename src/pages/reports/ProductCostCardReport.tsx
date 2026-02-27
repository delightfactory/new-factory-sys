import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Package, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PrintButton } from "@/components/print/PrintLayout";
import { useState } from "react";

interface CostBreakdown {
    id: number;
    name: string;
    code: string;
    unit: string;
    // Semi-finished info
    semiFinishedName: string;
    semiFinishedQty: number;
    semiFinishedCost: number;
    // Raw materials cost (through semi-finished recipe)
    rawMaterialsCost: number;
    rawMaterials: { name: string; percentage: number; cost: number }[];
    // Packaging cost
    packagingCost: number;
    packagingItems: { name: string; quantity: number; cost: number }[];
    // Totals
    totalCost: number;
    salesPrice: number;
    marginAmount: number;
    marginPercent: number;
    quantity: number;
}

export default function ProductCostCardReport() {
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

    const { data: products, isLoading } = useQuery({
        queryKey: ['product-cost-cards'],
        queryFn: async () => {
            // Batch fetch all required data in parallel (eliminates N+1 queries)
            const [finishedRes, semiFinishedRes, ingredientsRes, packagingRes] = await Promise.all([
                supabase.from('finished_products')
                    .select('id, code, name, unit, quantity, unit_cost, sales_price, semi_finished_id, semi_finished_quantity')
                    .order('name'),
                supabase.from('semi_finished_products').select('id, name, unit_cost'),
                supabase.from('semi_finished_ingredients')
                    .select('semi_finished_id, percentage, raw_material:raw_materials(name, unit_cost)'),
                supabase.from('finished_product_packaging')
                    .select('finished_product_id, quantity, packaging_material:packaging_materials(name, unit_cost)')
            ]);

            const finished = finishedRes.data || [];
            if (finished.length === 0) return [];

            // Build lookup maps for O(1) access
            const sfMap = new Map((semiFinishedRes.data || []).map(sf => [sf.id, sf]));
            const ingredientsBySfId = new Map<number, any[]>();
            (ingredientsRes.data || []).forEach((ing: any) => {
                const list = ingredientsBySfId.get(ing.semi_finished_id) || [];
                list.push(ing);
                ingredientsBySfId.set(ing.semi_finished_id, list);
            });
            const packagingByFpId = new Map<number, any[]>();
            (packagingRes.data || []).forEach((p: any) => {
                const list = packagingByFpId.get(p.finished_product_id) || [];
                list.push(p);
                packagingByFpId.set(p.finished_product_id, list);
            });

            const results: CostBreakdown[] = [];

            for (const fp of finished) {
                let semiFinishedName = '-';
                let semiFinishedCost = 0;
                let rawMaterials: { name: string; percentage: number; cost: number }[] = [];
                let rawMaterialsCost = 0;

                if (fp.semi_finished_id) {
                    const sf = sfMap.get(fp.semi_finished_id);
                    if (sf) {
                        semiFinishedName = sf.name;
                        semiFinishedCost = (sf.unit_cost || 0) * (fp.semi_finished_quantity || 1);
                    }

                    const ingredients = ingredientsBySfId.get(fp.semi_finished_id) || [];
                    rawMaterials = ingredients.map((ing: any) => {
                        const rmCost = ((ing.raw_material?.unit_cost || 0) * ing.percentage) / 100;
                        return {
                            name: ing.raw_material?.name || '-',
                            percentage: ing.percentage,
                            cost: rmCost
                        };
                    });
                    rawMaterialsCost = rawMaterials.reduce((s, r) => s + r.cost, 0) * (fp.semi_finished_quantity || 1);
                }

                const packaging = packagingByFpId.get(fp.id) || [];
                const packagingItems = packaging.map((p: any) => ({
                    name: p.packaging_material?.name || '-',
                    quantity: p.quantity,
                    cost: (p.packaging_material?.unit_cost || 0) * p.quantity
                }));

                const packagingCost = packagingItems.reduce((s, p) => s + p.cost, 0);
                const totalCost = fp.unit_cost || (semiFinishedCost + packagingCost);
                const salesPrice = fp.sales_price || 0;
                const marginAmount = salesPrice - totalCost;
                const marginPercent = salesPrice > 0 ? (marginAmount / salesPrice) * 100 : 0;

                results.push({
                    id: fp.id,
                    name: fp.name,
                    code: fp.code,
                    unit: fp.unit,
                    semiFinishedName,
                    semiFinishedQty: fp.semi_finished_quantity || 1,
                    semiFinishedCost,
                    rawMaterialsCost,
                    rawMaterials,
                    packagingCost,
                    packagingItems,
                    totalCost,
                    salesPrice,
                    marginAmount,
                    marginPercent,
                    quantity: fp.quantity
                });
            }

            return results;
        }
    });

    const selectedItem = products?.find(p => p.id === selectedProduct);

    const getMarginColor = (percent: number) => {
        if (percent < 0) return 'text-red-600';
        if (percent < 15) return 'text-amber-600';
        if (percent < 30) return 'text-blue-600';
        return 'text-emerald-600';
    };

    const getMarginBadge = (percent: number) => {
        if (percent < 0) return <Badge variant="destructive">سلبي</Badge>;
        if (percent < 15) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">منخفض</Badge>;
        if (percent < 30) return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">متوسط</Badge>;
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">ممتاز</Badge>;
    };

    return (
        <div className="space-y-6 print:space-y-2">
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="بطاقة تكلفة المنتج"
                        description="هيكل التكلفة التفصيلي لكل منتج تام مع هوامش الربح"
                        icon={CreditCard}
                    />
                </div>
                <PrintButton />
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">بطاقة تكلفة المنتجات</h1>
                <p className="text-sm text-gray-500">تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>

            {isLoading ? <CardGridSkeleton count={3} /> : (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">عدد المنتجات</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-blue-700">{products?.length || 0}</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700">متوسط هامش الربح</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-emerald-700">{formatNumber(products?.reduce((s, p) => s + p.marginPercent, 0)! / (products?.length || 1))}%</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-amber-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-700">أقل هامش</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-amber-700">{products?.length ? formatNumber(Math.min(...products.map(p => p.marginPercent))) : 0}%</div></CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200">
                            <CardHeader className="pb-2"><CardTitle className="text-sm text-purple-700">أعلى هامش</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold text-purple-700">{products?.length ? formatNumber(Math.max(...products.map(p => p.marginPercent))) : 0}%</div></CardContent>
                        </Card>
                    </div>

                    {/* Products Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>هيكل تكلفة المنتجات</CardTitle>
                            <CardDescription>اضغط على أي منتج لعرض التفاصيل الكاملة</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>المنتج</TableHead>
                                        <TableHead className="text-center">تكلفة الوحدة</TableHead>
                                        <TableHead className="text-center">سعر البيع</TableHead>
                                        <TableHead className="text-center">هامش الربح</TableHead>
                                        <TableHead className="text-center">النسبة</TableHead>
                                        <TableHead className="text-center">التقييم</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {products?.map(product => (
                                        <TableRow
                                            key={product.id}
                                            className="cursor-pointer hover:bg-muted/80"
                                            onClick={() => setSelectedProduct(selectedProduct === product.id ? null : product.id)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-muted-foreground" />
                                                    <div>
                                                        <div className="font-medium">{product.name}</div>
                                                        <div className="text-xs text-muted-foreground">{product.code}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-mono">{formatCurrency(product.totalCost)}</TableCell>
                                            <TableCell className="text-center font-mono">{formatCurrency(product.salesPrice)}</TableCell>
                                            <TableCell className={`text-center font-mono font-bold ${getMarginColor(product.marginPercent)}`}>
                                                {formatCurrency(product.marginAmount)}
                                            </TableCell>
                                            <TableCell className={`text-center font-bold ${getMarginColor(product.marginPercent)}`}>
                                                <div className="flex items-center justify-center gap-1">
                                                    {product.marginPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {formatNumber(product.marginPercent)}%
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">{getMarginBadge(product.marginPercent)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Detail Card */}
                    {selectedItem && (
                        <Card className="border-2 border-primary/20 print:border print:break-inside-avoid">
                            <CardHeader className="bg-muted/50">
                                <CardTitle className="flex items-center gap-2">
                                    <CreditCard className="w-5 h-5" />
                                    بطاقة تكلفة: {selectedItem.name}
                                </CardTitle>
                                <CardDescription>الكود: {selectedItem.code} | الوحدة: {selectedItem.unit} | الكمية المتاحة: {selectedItem.quantity}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-6">
                                {/* Semi-finished info */}
                                <div>
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <div className="w-3 h-3 bg-blue-500 rounded-full" />
                                        المنتج النصف مصنع: {selectedItem.semiFinishedName}
                                        <span className="text-sm font-normal text-muted-foreground">({selectedItem.semiFinishedQty} وحدة)</span>
                                    </h4>
                                    {selectedItem.rawMaterials.length > 0 && (
                                        <div className="mr-6 space-y-1">
                                            {selectedItem.rawMaterials.map((rm, i) => (
                                                <div key={i} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                                                    <span>{rm.name} ({rm.percentage}%)</span>
                                                    <span className="font-mono">{formatCurrency(rm.cost)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between text-sm font-bold p-2 border-t">
                                                <span>إجمالي تكلفة النصف مصنع</span>
                                                <span className="font-mono">{formatCurrency(selectedItem.semiFinishedCost)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Packaging info */}
                                {selectedItem.packagingItems.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                                            <div className="w-3 h-3 bg-purple-500 rounded-full" />
                                            مواد التعبئة والتغليف
                                        </h4>
                                        <div className="mr-6 space-y-1">
                                            {selectedItem.packagingItems.map((pk, i) => (
                                                <div key={i} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                                                    <span>{pk.name} (×{pk.quantity})</span>
                                                    <span className="font-mono">{formatCurrency(pk.cost)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between text-sm font-bold p-2 border-t">
                                                <span>إجمالي تكلفة التعبئة</span>
                                                <span className="font-mono">{formatCurrency(selectedItem.packagingCost)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Final Summary */}
                                <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
                                    <div className="flex justify-between text-sm">
                                        <span>تكلفة النصف مصنع</span>
                                        <span className="font-mono">{formatCurrency(selectedItem.semiFinishedCost)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>تكلفة التعبئة</span>
                                        <span className="font-mono">{formatCurrency(selectedItem.packagingCost)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold border-t pt-2">
                                        <span>إجمالي تكلفة الوحدة</span>
                                        <span className="font-mono text-red-600">{formatCurrency(selectedItem.totalCost)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>سعر البيع</span>
                                        <span className="font-mono text-blue-600">{formatCurrency(selectedItem.salesPrice)}</span>
                                    </div>
                                    <div className={`flex justify-between font-bold text-lg border-t pt-2 ${getMarginColor(selectedItem.marginPercent)}`}>
                                        <span className="flex items-center gap-2">
                                            هامش الربح
                                            {selectedItem.marginPercent < 0 && <AlertTriangle className="w-4 h-4" />}
                                        </span>
                                        <span className="font-mono">{formatCurrency(selectedItem.marginAmount)} ({formatNumber(selectedItem.marginPercent)}%)</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
