import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    className?: string;
    iconColor?: string;
    /** Navigation destination when card is clicked */
    href?: string;
}

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
    trend,
    trendValue,
    className,
    iconColor,
    href
}: StatCardProps) {
    const cardContent = (
        <Card className={cn(
            "transition-all duration-200",
            href && "cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
            className
        )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <div className={cn(
                    "p-2 rounded-lg transition-colors",
                    href ? "bg-primary/10" : "bg-muted/50"
                )}>
                    <Icon className={cn("h-4 w-4", iconColor || "text-muted-foreground")} />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {description}
                    </p>
                )}
                {trendValue && (
                    <div className={cn("flex items-center text-xs mt-1",
                        trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"
                    )}>
                        {trendValue}
                    </div>
                )}
            </CardContent>
        </Card>
    );

    if (href) {
        return (
            <Link to={href} className="block">
                {cardContent}
            </Link>
        );
    }

    return cardContent;
}
