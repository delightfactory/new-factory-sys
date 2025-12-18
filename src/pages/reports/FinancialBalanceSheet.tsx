import { useQuery } from "@tanstack/react-query";
import { BalanceSheetService } from "@/services/BalanceSheetService";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PrintButton } from "@/components/print/PrintLayout";
import { CardGridSkeleton } from "@/components/ui/loading-skeleton";
import { Link } from "react-router-dom";
import {
    Scale,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Wallet,
    Package,
    Users,
    Building2,
    ArrowUpRight,
    ArrowDownRight,
    AlertCircle,
    CheckCircle2,
    Banknote,
    Landmark,
    Phone
} from "lucide-react";

export default function FinancialBalanceSheet() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['financial-balance-sheet'],
        queryFn: () => BalanceSheetService.getBalanceSheet(),
        refetchInterval: 60000 // تحديث كل دقيقة
    });

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value) + ' ج.م';

    const getStatusColor = (netPosition: number) => {
        if (netPosition > 0) return 'text-emerald-600';
        if (netPosition < 0) return 'text-red-600';
        return 'text-gray-600';
    };

    const getStatusBg = (netPosition: number) => {
        if (netPosition > 0) return 'from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10';
        if (netPosition < 0) return 'from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10';
        return 'from-gray-50 to-gray-100/50 dark:from-gray-900/20 dark:to-gray-800/10';
    };

    if (error) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                <p className="text-red-600">حدث خطأ في تحميل البيانات</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link to="/reports"><ArrowRight /></Link>
                    </Button>
                    <PageHeader
                        title="الميزان المالي للمصنع"
                        description="صافي المركز المالي الحقيقي: الأصول مقابل الالتزامات"
                        icon={Scale}
                    />
                </div>
                <div className="flex gap-2">
                    <PrintButton label="طباعة التقرير" />
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-bold">الميزان المالي للمصنع</h1>
                <p className="text-sm text-gray-500">
                    تاريخ التقرير: {new Date().toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            </div>

            {isLoading ? (
                <CardGridSkeleton count={4} />
            ) : data && (
                <div className="space-y-6">
                    {/* Hero Card - صافي المركز المالي */}
                    <Card className={`bg-gradient-to-br ${getStatusBg(data.netPosition)} border-2 ${data.netPosition >= 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Scale className="w-6 h-6" />
                                صافي المركز المالي
                            </CardTitle>
                            <CardDescription>
                                الفرق بين ما تملكه الشركة وما عليها من التزامات
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                                {/* Main Value */}
                                <div className="text-center lg:text-right">
                                    <div className="flex items-center justify-center lg:justify-start gap-3">
                                        {data.netPosition >= 0 ? (
                                            <TrendingUp className="w-10 h-10 text-emerald-500" />
                                        ) : (
                                            <TrendingDown className="w-10 h-10 text-red-500" />
                                        )}
                                        <span className={`text-4xl lg:text-5xl font-black ${getStatusColor(data.netPosition)}`}>
                                            {formatCurrency(Math.abs(data.netPosition))}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {data.netPosition >= 0 ? (
                                            <span className="flex items-center justify-center lg:justify-start gap-1">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                المركز المالي إيجابي - الأصول تغطي الالتزامات
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-center lg:justify-start gap-1">
                                                <AlertCircle className="w-4 h-4 text-red-500" />
                                                المركز المالي سالب - الالتزامات تتجاوز الأصول
                                            </span>
                                        )}
                                    </p>
                                </div>

                                {/* Summary Stats */}
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="p-4 rounded-xl bg-white/60 dark:bg-black/20 border">
                                        <div className="text-xs text-muted-foreground mb-1">إجمالي الأصول</div>
                                        <div className="text-lg font-bold text-blue-600">
                                            {formatCurrency(data.assets.total)}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/60 dark:bg-black/20 border">
                                        <div className="text-xs text-muted-foreground mb-1">إجمالي الالتزامات</div>
                                        <div className="text-lg font-bold text-orange-600">
                                            {formatCurrency(data.liabilities.total)}
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/60 dark:bg-black/20 border">
                                        <div className="text-xs text-muted-foreground mb-1">نسبة التغطية</div>
                                        <div className={`text-lg font-bold ${data.coverageRatio >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {data.coverageRatio}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Assets & Liabilities Grid */}
                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* الأصول (لنا) */}
                        <Card className="border-t-4 border-t-emerald-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                    <ArrowUpRight className="w-5 h-5" />
                                    الأصول (لنا)
                                </CardTitle>
                                <CardDescription>ما تملكه الشركة من أصول وحقوق</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* المخزون */}
                                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Package className="w-5 h-5 text-amber-600" />
                                            <span className="font-semibold">قيمة المخزون</span>
                                        </div>
                                        <span className="text-lg font-bold text-amber-700">
                                            {formatCurrency(data.assets.inventory)}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {data.inventoryBreakdown.map((item) => (
                                            <div key={item.type} className="flex justify-between p-2 bg-white/50 dark:bg-black/20 rounded">
                                                <span className="text-muted-foreground">{item.typeLabel}</span>
                                                <span className="font-mono">{formatCurrency(item.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* الخزائن */}
                                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-5 h-5 text-emerald-600" />
                                            <span className="font-semibold">السيولة النقدية</span>
                                        </div>
                                        <span className="text-lg font-bold text-emerald-700">
                                            {formatCurrency(data.assets.cash)}
                                        </span>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        {data.treasuryBreakdown.map((treasury) => (
                                            <div key={treasury.id} className="flex justify-between items-center p-2 bg-white/50 dark:bg-black/20 rounded">
                                                <div className="flex items-center gap-2">
                                                    {treasury.type === 'cash' ? (
                                                        <Banknote className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                        <Landmark className="w-4 h-4 text-blue-500" />
                                                    )}
                                                    <span className="text-muted-foreground">{treasury.name}</span>
                                                </div>
                                                <span className="font-mono">{formatCurrency(treasury.balance)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* مديونية العملاء */}
                                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-5 h-5 text-blue-600" />
                                            <span className="font-semibold">مديونية العملاء لنا</span>
                                            <Badge variant="secondary" className="text-xs">
                                                {data.customersWithDebt} عميل
                                            </Badge>
                                        </div>
                                        <span className="text-lg font-bold text-blue-700">
                                            {formatCurrency(data.assets.receivables)}
                                        </span>
                                    </div>
                                    {data.topReceivables.length > 0 ? (
                                        <div className="space-y-2 text-sm">
                                            {data.topReceivables.map((customer) => (
                                                <div key={customer.id} className="flex justify-between items-center p-2 bg-white/50 dark:bg-black/20 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span>{customer.name}</span>
                                                        {customer.phone && (
                                                            <Phone className="w-3 h-3 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-blue-600">{formatCurrency(customer.balance)}</span>
                                                </div>
                                            ))}
                                            {data.customersWithDebt > 5 && (
                                                <p className="text-xs text-center text-muted-foreground pt-2">
                                                    و {data.customersWithDebt - 5} عميل آخر...
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-2">
                                            لا يوجد عملاء مدينين حالياً
                                        </p>
                                    )}
                                </div>

                                {/* إجمالي الأصول */}
                                <div className="p-4 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">إجمالي الأصول</span>
                                        <span className="text-2xl font-bold">
                                            {formatCurrency(data.assets.total)}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* الالتزامات (علينا) */}
                        <Card className="border-t-4 border-t-orange-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                                    <ArrowDownRight className="w-5 h-5" />
                                    الالتزامات (علينا)
                                </CardTitle>
                                <CardDescription>ما على الشركة من ديون والتزامات</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* مديونية الموردين */}
                                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-5 h-5 text-orange-600" />
                                            <span className="font-semibold">مديونيتنا للموردين</span>
                                            <Badge variant="secondary" className="text-xs">
                                                {data.suppliersWeOwe} مورد
                                            </Badge>
                                        </div>
                                        <span className="text-lg font-bold text-orange-700">
                                            {formatCurrency(data.liabilities.payables)}
                                        </span>
                                    </div>
                                    {data.topPayables.length > 0 ? (
                                        <div className="space-y-2 text-sm">
                                            {data.topPayables.map((supplier) => (
                                                <div key={supplier.id} className="flex justify-between items-center p-2 bg-white/50 dark:bg-black/20 rounded">
                                                    <div className="flex items-center gap-2">
                                                        <span>{supplier.name}</span>
                                                        {supplier.phone && (
                                                            <Phone className="w-3 h-3 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-orange-600">{formatCurrency(supplier.balance)}</span>
                                                </div>
                                            ))}
                                            {data.suppliersWeOwe > 5 && (
                                                <p className="text-xs text-center text-muted-foreground pt-2">
                                                    و {data.suppliersWeOwe - 5} مورد آخر...
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8">
                                            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                                            <p className="text-sm text-emerald-600 font-medium">
                                                لا توجد ديون للموردين! 🎉
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* إجمالي الالتزامات */}
                                <div className="p-4 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">إجمالي الالتزامات</span>
                                        <span className="text-2xl font-bold">
                                            {formatCurrency(data.liabilities.total)}
                                        </span>
                                    </div>
                                </div>

                                {/* Coverage Ratio Visual */}
                                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/20 border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">نسبة تغطية الأصول للالتزامات</span>
                                        <span className={`font-bold ${data.coverageRatio >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {data.coverageRatio}%
                                        </span>
                                    </div>
                                    <Progress
                                        value={Math.min(data.coverageRatio, 200) / 2}
                                        className={`h-3 ${data.coverageRatio >= 100 ? '[&>div]:bg-emerald-500' : '[&>div]:bg-red-500'}`}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {data.coverageRatio >= 200
                                            ? "ممتاز! الأصول تغطي الالتزامات مرتين أو أكثر"
                                            : data.coverageRatio >= 150
                                                ? "جيد جداً! هامش أمان مريح"
                                                : data.coverageRatio >= 100
                                                    ? "جيد! الأصول تغطي الالتزامات"
                                                    : "تحذير! الالتزامات تتجاوز الأصول"
                                        }
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ملخص القرار */}
                    <Card className={`border-r-4 ${data.netPosition >= 0 ? 'border-r-emerald-500' : 'border-r-red-500'}`}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                قراءة الميزان المالي
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {/* تحليل السيولة */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        <Wallet className="w-4 h-4 text-emerald-500" />
                                        السيولة النقدية
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        {data.assets.cash >= data.liabilities.payables
                                            ? `السيولة النقدية (${formatCurrency(data.assets.cash)}) كافية لتغطية جميع ديون الموردين.`
                                            : `السيولة النقدية (${formatCurrency(data.assets.cash)}) لا تكفي لتغطية ديون الموردين. الفرق: ${formatCurrency(data.liabilities.payables - data.assets.cash)}`
                                        }
                                    </p>
                                </div>

                                {/* تحليل المخزون */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-amber-500" />
                                        قيمة المخزون
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        المخزون يمثل {Math.round((data.assets.inventory / data.assets.total) * 100)}% من إجمالي الأصول.
                                        {data.assets.inventory > data.assets.cash && data.assets.inventory > data.assets.receivables
                                            ? " (أكبر مكون للأصول)"
                                            : ""
                                        }
                                    </p>
                                </div>

                                {/* تحليل الديون */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-500" />
                                        الذمم المدينة
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        {data.assets.receivables > 0
                                            ? `لديك ${formatCurrency(data.assets.receivables)} مستحقات من ${data.customersWithDebt} عميل يجب تحصيلها.`
                                            : "جميع العملاء ملتزمون بالسداد - ممتاز!"
                                        }
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
