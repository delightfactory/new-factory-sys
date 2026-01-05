import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Package } from "lucide-react";
import { Badge } from "./badge";

export interface MaterialItem {
    id: number;
    name: string;
    unit: string;
    requiredQty: number;
    availableQty: number;
}

interface MaterialPreviewCardProps {
    title: string;
    materials: MaterialItem[];
    isLoading?: boolean;
    className?: string;
}

type AvailabilityStatus = 'available' | 'insufficient' | 'unavailable';

function getAvailabilityStatus(required: number, available: number): AvailabilityStatus {
    if (required <= 0) return 'available';
    if (available >= required) return 'available';
    if (available > 0) return 'insufficient';
    return 'unavailable';
}

function getStatusConfig(status: AvailabilityStatus) {
    const configs = {
        available: {
            icon: CheckCircle2,
            label: 'متوفر',
            className: 'text-green-600 dark:text-green-400',
            bgClassName: 'bg-green-50 dark:bg-green-950/30',
            badgeVariant: 'default' as const
        },
        insufficient: {
            icon: AlertTriangle,
            label: 'غير كافي',
            className: 'text-amber-600 dark:text-amber-400',
            bgClassName: 'bg-amber-50 dark:bg-amber-950/30',
            badgeVariant: 'secondary' as const
        },
        unavailable: {
            icon: XCircle,
            label: 'غير متوفر',
            className: 'text-red-600 dark:text-red-400',
            bgClassName: 'bg-red-50 dark:bg-red-950/30',
            badgeVariant: 'destructive' as const
        }
    };
    return configs[status];
}

export function MaterialPreviewCard({
    title,
    materials,
    isLoading = false,
    className
}: MaterialPreviewCardProps) {
    if (isLoading) {
        return (
            <div className={cn("border rounded-lg p-4 bg-muted/20", className)}>
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">جاري تحميل متطلبات المواد...</span>
                </div>
            </div>
        );
    }

    if (!materials || materials.length === 0) {
        return (
            <div className={cn("border rounded-lg p-4 bg-muted/20", className)}>
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                    <Package className="h-4 w-4" />
                    <span className="text-sm">لا توجد مواد مطلوبة</span>
                </div>
            </div>
        );
    }

    // Calculate overall status
    const allAvailable = materials.every(m => m.availableQty >= m.requiredQty);
    const anyUnavailable = materials.some(m => m.requiredQty > 0 && m.availableQty === 0);
    const overallStatus: AvailabilityStatus = allAvailable ? 'available' : (anyUnavailable ? 'unavailable' : 'insufficient');
    const overallConfig = getStatusConfig(overallStatus);

    return (
        <div className={cn("border rounded-lg overflow-hidden", overallConfig.bgClassName, className)}>
            {/* Header */}
            <div className="px-4 py-3 border-b bg-background/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{title}</span>
                </div>
                <Badge variant={overallConfig.badgeVariant} className="text-xs">
                    {materials.length} مادة
                </Badge>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[320px]">
                    <thead>
                        <tr className="border-b bg-muted/30">
                            <th className="text-right px-2 sm:px-4 py-2 font-medium text-muted-foreground whitespace-nowrap">المادة</th>
                            <th className="text-center px-2 sm:px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">المطلوب</th>
                            <th className="text-center px-2 sm:px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">المتوفر</th>
                            <th className="text-center px-2 sm:px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map((material, index) => {
                            const status = getAvailabilityStatus(material.requiredQty, material.availableQty);
                            const config = getStatusConfig(status);
                            const StatusIcon = config.icon;
                            const shortage = material.requiredQty - material.availableQty;

                            return (
                                <tr key={`${material.name}-${index}`} className="border-b last:border-0 hover:bg-muted/20">
                                    <td className="px-2 sm:px-4 py-2">
                                        <span className="font-medium text-xs sm:text-sm">{material.name}</span>
                                    </td>
                                    <td className="text-center px-2 sm:px-3 py-2">
                                        <span className="font-mono text-xs sm:text-sm">{material.requiredQty.toLocaleString()}</span>
                                        <span className="text-muted-foreground text-[10px] sm:text-xs mr-1 hidden sm:inline">{material.unit}</span>
                                    </td>
                                    <td className="text-center px-2 sm:px-3 py-2">
                                        <span className="font-mono text-xs sm:text-sm">{material.availableQty.toLocaleString()}</span>
                                        <span className="text-muted-foreground text-[10px] sm:text-xs mr-1 hidden sm:inline">{material.unit}</span>
                                    </td>
                                    <td className="text-center px-2 sm:px-3 py-2">
                                        <div className={cn("flex items-center justify-center gap-1", config.className)}>
                                            <StatusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                            <span className="text-[10px] sm:text-xs hidden sm:inline">
                                                {status === 'insufficient' ? `نقص ${shortage.toLocaleString()}` : config.label}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
