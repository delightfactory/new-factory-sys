import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Confirmation {
    title: string;
    description: string;
    acceptLabel: string;
    cancelLabel?: string;
}

export function useConfirmation() {
    const [request, setRequest] = useState<Confirmation | null>(null);
    const resolve = useRef<((accepted: boolean) => void) | null>(null);
    const opener = useRef<HTMLElement | (() => HTMLElement | null) | null>(null);
    useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
    const ask = useCallback((next: Confirmation, returnFocusTo?: HTMLElement | (() => HTMLElement | null)): Promise<boolean> => {
        if (resolve.current) return Promise.resolve(false);
        opener.current = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        return new Promise<boolean>(finish => {
            resolve.current = finish;
            setRequest(next);
        });
    }, []);
    const settle = (accepted: boolean) => {
        const finish = resolve.current;
        resolve.current = null;
        setRequest(null);
        finish?.(accepted);
    };
    return { ask, confirmation: <AlertDialog open={!!request} onOpenChange={open => { if (!open) settle(false); }}>
        <AlertDialogContent raised onCloseAutoFocus={event => {
            const target = typeof opener.current === 'function' ? opener.current() : opener.current;
            if (target?.isConnected && !target.matches(':disabled')) { event.preventDefault(); target.focus(); }
        }}>
            <AlertDialogHeader>
                <AlertDialogTitle>{request?.title}</AlertDialogTitle>
                <AlertDialogDescription>{request?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
                <AlertDialogCancel type="button" onClick={() => settle(false)}>{request?.cancelLabel ?? 'متابعة التعديل'}</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={() => settle(true)}>{request?.acceptLabel}</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog> };
}
