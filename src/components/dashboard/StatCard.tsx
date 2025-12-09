import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    className?: string; // Additional classes for customization
    iconColor?: string; // Class for icon color, e.g. "text-blue-500"
}

export function StatCard({ title, value, description, icon: Icon, trend, trendValue, className, iconColor }: StatCardProps) {
    return (
        <Card className={cn("hover:shadow-md transition-shadow", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className={cn("h-4 w-4 text-muted-foreground", iconColor)} />
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
}
