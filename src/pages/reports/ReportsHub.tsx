import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
    FileText,
    Package,
    Factory,
    TrendingUp,
    ArrowLeft,
    AlertTriangle,
    Activity,
    BarChart3,
    Clock,
    RotateCw,
    Users,
    Scale
} from "lucide-react";

export default function ReportsHub() {
    const reports = [
        {
            title: "نظام دعم القرار (Executive)",
            description: "لوحة قيادة استراتيجية للمدير العام: مؤشرات الصحة، الربحية، والتوصيات الذكية.",
            icon: Activity,
            color: "text-indigo-600",
            path: "/reports/executive",
            bg: "bg-indigo-50 dark:bg-indigo-900/20"
        },
        {
            title: "الميزان المالي",
            description: "صافي المركز المالي: قيمة المخزون + السيولة + مستحقات العملاء - ديون الموردين.",
            icon: Scale,
            color: "text-emerald-600",
            path: "/reports/balance-sheet",
            bg: "bg-emerald-50 dark:bg-emerald-900/20"
        },
        {
            title: "أعمار الديون",
            description: "تحليل الفواتير المستحقة حسب فترة التأخير (30/60/90+ يوم) للعملاء والموردين.",
            icon: Clock,
            color: "text-cyan-500",
            path: "/reports/aging",
            bg: "bg-cyan-50 dark:bg-cyan-900/20"
        },
        {
            title: "دوران المخزون",
            description: "معدل دوران الأصناف، أيام التغطية، والمخزون الراكد لتحسين إدارة المخزون.",
            icon: RotateCw,
            color: "text-teal-500",
            path: "/reports/turnover",
            bg: "bg-teal-50 dark:bg-teal-900/20"
        },
        {
            title: "تحليل العملاء والموردين",
            description: "تحليل شامل للأطراف: التعاملات، المرتجعات، متوسط فترة السداد.",
            icon: Users,
            color: "text-pink-500",
            path: "/reports/party-analysis",
            bg: "bg-pink-50 dark:bg-pink-900/20"
        },
        {
            title: "تحليل المخزون المتقدم",
            description: "تحليل ABC، توزيع القيمة، الترتيب حسب القيمة/الكمية/الربح، رسوم بيانية.",
            icon: BarChart3,
            color: "text-purple-500",
            path: "/reports/inventory-analytics",
            bg: "bg-purple-50 dark:bg-purple-900/20"
        },
        {
            title: "تقييم المخزون",
            description: "تحليل شامل لقيمة المخزون الحالي (خامات، منتجات، تعبئة) وتكلفة كل صنف.",
            icon: Package,
            color: "text-blue-500",
            path: "/reports/inventory",
            bg: "bg-blue-50 dark:bg-blue-900/20"
        },
        {
            title: "كفاءة الإنتاج",
            description: "متابعة أوامر التشغيل، الكميات المنتجة، ونسب الهالك للأوامر المنتهية.",
            icon: Factory,
            color: "text-orange-500",
            path: "/reports/production",
            bg: "bg-orange-50 dark:bg-orange-900/20"
        },
        {
            title: "أداء المنتجات",
            description: "تحليل ربحية كل منتج، هوامش الربح، والأصناف الأكثر مبيعاً.",
            icon: TrendingUp,
            color: "text-green-500",
            path: "/reports/products",
            bg: "bg-green-50 dark:bg-green-900/20"
        },
        {
            title: "نواقص المخزون",
            description: "قائمة عاجلة بالأصناف التي وصلت للحد الأدنى وتحتاج طلب شراء.",
            icon: AlertTriangle,
            color: "text-red-500",
            path: "/reports/low-stock",
            bg: "bg-red-50 dark:bg-red-900/20"
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="مركز التقارير"
                description="تقارير تفصيلية لتحليل أداء المصنع واتخاذ القرارات"
                icon={FileText}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => (
                    <Card key={report.path} className="hover:shadow-lg transition-all border-muted">
                        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                            <div className={`p-3 rounded-xl ${report.bg}`}>
                                <report.icon className={`w-6 h-6 ${report.color}`} />
                            </div>
                            <div className="space-y-1">
                                <CardTitle className="text-base">{report.title}</CardTitle>
                                <CardDescription className="text-xs leading-relaxed">
                                    {report.description}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full gap-2 group" asChild>
                                <Link to={report.path}>
                                    عرض التقرير
                                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
