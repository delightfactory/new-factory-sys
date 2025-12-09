import { useState, useCallback } from "react";

interface UseConfirmDialogOptions {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}

interface ConfirmDialogState extends UseConfirmDialogOptions {
    open: boolean;
    onConfirm: () => void;
}

export function useConfirmDialog() {
    const [state, setState] = useState<ConfirmDialogState>({
        open: false,
        title: "",
        description: "",
        confirmText: "تأكيد",
        cancelText: "إلغاء",
        variant: 'default',
        onConfirm: () => { },
    });

    const confirm = useCallback((options: UseConfirmDialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({
                open: true,
                ...options,
                onConfirm: () => {
                    setState(prev => ({ ...prev, open: false }));
                    resolve(true);
                },
            });
        });
    }, []);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, open: false }));
    }, []);

    return {
        dialogProps: {
            open: state.open,
            onOpenChange: (open: boolean) => {
                if (!open) close();
            },
            title: state.title,
            description: state.description,
            confirmText: state.confirmText,
            cancelText: state.cancelText,
            variant: state.variant,
            onConfirm: state.onConfirm,
        },
        confirm,
        close,
    };
}
