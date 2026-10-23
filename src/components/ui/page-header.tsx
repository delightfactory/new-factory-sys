import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    actions?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-border pb-5">
            <div className="flex min-w-0 items-center gap-3">
                {Icon && (
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                    </div>
                )}
                <div>
                    <h1 className="text-2xl font-bold leading-relaxed">{title}</h1>
                    {description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
                    {actions}
                </div>
            )}
        </div>
    );
}
