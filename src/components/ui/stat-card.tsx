import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon?: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
    variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
    default: "bg-card",
    success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    danger: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
};

const iconVariantStyles = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400",
    warning: "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400",
    danger: "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400",
};

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
    trend,
    className,
    variant = 'default',
}: StatCardProps) {
    return (
        <Card className={cn(variantStyles[variant], "transition-all hover:shadow-md", className)}>
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <p className="text-2xl font-bold tracking-tight">{value}</p>
                        {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                        )}
                        {trend && (
                            <div className={cn(
                                "text-xs font-medium flex items-center gap-1",
                                trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                            )}>
                                <span>{trend.isPositive ? "↑" : "↓"}</span>
                                <span>{Math.abs(trend.value)}%</span>
                                <span className="text-muted-foreground">من الشهر السابق</span>
                            </div>
                        )}
                    </div>
                    {Icon && (
                        <div className={cn("p-3 rounded-lg", iconVariantStyles[variant])}>
                            <Icon className="h-5 w-5" />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
