"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-media-query";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "./sheet";

// ============================================================================
// Types
// ============================================================================

export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

interface ResponsiveDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void;
    /** Dialog title */
    title: string;
    /** Optional description shown below title */
    description?: string;
    /** Dialog size (desktop only) */
    size?: DialogSize;
    /** Dialog content */
    children: React.ReactNode;
    /** Footer content (typically action buttons) */
    footer?: React.ReactNode;
    /** Additional className for the content container */
    className?: string;
    /** Whether to show close button */
    showCloseButton?: boolean;
}

// ============================================================================
// Size Configuration
// ============================================================================

const sizeClasses: Record<DialogSize, string> = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[95vw]",
};

// ============================================================================
// ResponsiveDialog Component
// ============================================================================

/**
 * ResponsiveDialog - A responsive dialog component that renders as:
 * - Bottom Sheet on mobile devices for better UX
 * - Centered Dialog on desktop devices
 * 
 * Features:
 * - Automatic mobile detection
 * - Fixed header and footer with scrollable content
 * - Multiple size variants
 * - Consistent styling across the application
 */
export function ResponsiveDialog({
    open,
    onOpenChange,
    title,
    description,
    size = "md",
    children,
    footer,
    className,
}: ResponsiveDialogProps) {
    const isMobile = useIsMobile();

    // Mobile: Render as Bottom Sheet
    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    className={cn(
                        "h-[85vh] rounded-t-2xl flex flex-col p-0",
                        className
                    )}
                >
                    {/* Drag Handle */}
                    <div className="flex justify-center py-2">
                        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
                    </div>

                    {/* Header - Fixed */}
                    <SheetHeader className="px-4 pb-3 border-b shrink-0">
                        <SheetTitle className="text-lg">{title}</SheetTitle>
                        {description && (
                            <SheetDescription className="text-sm">
                                {description}
                            </SheetDescription>
                        )}
                    </SheetHeader>

                    {/* Content - Scrollable */}
                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        {children}
                    </div>

                    {/* Footer - Fixed */}
                    {footer && (
                        <SheetFooter className="px-4 py-4 border-t bg-background shrink-0 gap-2 flex-row justify-end">
                            {footer}
                        </SheetFooter>
                    )}
                </SheetContent>
            </Sheet>
        );
    }

    // Desktop: Render as centered Dialog
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "flex flex-col max-h-[85vh] p-0 gap-0",
                    sizeClasses[size],
                    className
                )}
            >
                {/* Header - Fixed */}
                <DialogHeader className="px-6 py-4 border-b shrink-0">
                    <DialogTitle>{title}</DialogTitle>
                    {description && (
                        <DialogDescription>{description}</DialogDescription>
                    )}
                </DialogHeader>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {children}
                </div>

                {/* Footer - Fixed */}
                {footer && (
                    <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
                        {footer}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ============================================================================
// ResponsiveFormGrid Component
// ============================================================================

interface ResponsiveFormGridProps {
    /** Form fields as children */
    children: React.ReactNode;
    /** Number of columns on desktop (1-4) */
    columns?: 1 | 2 | 3 | 4;
    /** Additional className */
    className?: string;
}

/**
 * ResponsiveFormGrid - A responsive grid for form fields
 * 
 * Features:
 * - Single column on mobile
 * - Multiple columns on larger screens
 * - Consistent gap between fields
 */
export function ResponsiveFormGrid({
    children,
    columns = 2,
    className,
}: ResponsiveFormGridProps) {
    return (
        <div
            className={cn(
                "grid gap-4",
                // Mobile: Always 1 column
                "grid-cols-1",
                // Tablet+: Based on columns prop
                columns >= 2 && "sm:grid-cols-2",
                columns >= 3 && "lg:grid-cols-3",
                columns >= 4 && "xl:grid-cols-4",
                className
            )}
        >
            {children}
        </div>
    );
}

// ============================================================================
// ResponsiveFormSection Component
// ============================================================================

interface ResponsiveFormSectionProps {
    /** Section title */
    title?: string;
    /** Section description */
    description?: string;
    /** Section content */
    children: React.ReactNode;
    /** Additional className */
    className?: string;
}

/**
 * ResponsiveFormSection - A section wrapper for form fields with optional title
 */
export function ResponsiveFormSection({
    title,
    description,
    children,
    className,
}: ResponsiveFormSectionProps) {
    return (
        <div className={cn("space-y-4", className)}>
            {(title || description) && (
                <div className="space-y-1">
                    {title && (
                        <h3 className="font-medium text-base">{title}</h3>
                    )}
                    {description && (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}

// ============================================================================
// ResponsiveDialogActions Component
// ============================================================================

interface ResponsiveDialogActionsProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * ResponsiveDialogActions - A wrapper for action buttons in the dialog footer
 * Ensures proper spacing and alignment on both mobile and desktop
 */
export function ResponsiveDialogActions({
    children,
    className,
}: ResponsiveDialogActionsProps) {
    return (
        <div className={cn("flex flex-row gap-2 justify-end", className)}>
            {children}
        </div>
    );
}
