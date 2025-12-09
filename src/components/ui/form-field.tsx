import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
    label: string;
    required?: boolean;
    error?: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export function FormField({
    label,
    required = false,
    error,
    description,
    children,
    className,
}: FormFieldProps) {
    return (
        <div className={cn("space-y-2", className)}>
            <Label className="flex items-center gap-1">
                {label}
                {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
            {description && !error && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}
        </div>
    );
}

interface FormGridProps {
    children: React.ReactNode;
    columns?: 1 | 2 | 3 | 4;
    className?: string;
}

export function FormGrid({
    children,
    columns = 2,
    className,
}: FormGridProps) {
    const gridCols = {
        1: "grid-cols-1",
        2: "grid-cols-1 md:grid-cols-2",
        3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    };

    return (
        <div className={cn("grid gap-4", gridCols[columns], className)}>
            {children}
        </div>
    );
}

interface FormSectionProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export function FormSection({
    title,
    description,
    children,
    className,
}: FormSectionProps) {
    return (
        <div className={cn("space-y-4", className)}>
            <div className="border-b pb-2">
                <h3 className="font-medium">{title}</h3>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {children}
        </div>
    );
}

interface FormActionsProps {
    children: React.ReactNode;
    className?: string;
}

export function FormActions({
    children,
    className,
}: FormActionsProps) {
    return (
        <div className={cn("flex items-center justify-end gap-3 pt-4 border-t", className)}>
            {children}
        </div>
    );
}
