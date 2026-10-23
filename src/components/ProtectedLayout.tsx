import { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import * as BlockingDialog from '@radix-ui/react-dialog';
import { AuthWorkspaceBoundary, useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import Layout from '@/components/Layout';
import { AccessNotice } from '@/components/auth/AccessNotice';

export default function ProtectedLayout() {
    const { session, isLoading, profile, canRetainWorkspace, workspaceEpoch } = useAuth();
    const location = useLocation();
    const lastFocus = useRef<HTMLElement | null>(null);
    const workspace = useRef<HTMLDivElement>(null);
    if (!session && !isLoading) return <Navigate to="/login" state={{ from: location }} replace />;
    if (isLoading && !canRetainWorkspace) return <div role="status" className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" /><span className="sr-only">جارٍ التحقق من حسابك…</span>
    </div>;
    if (!canRetainWorkspace && (!profile || profile.id !== session?.user.id)) return <AccessNotice title="تعذر التحقق من صلاحيات حسابك" description="أعد المحاولة. إذا استمرت المشكلة، تواصل مع مدير النظام." retryLabel="إعادة المحاولة" />;
    if (!canRetainWorkspace && profile?.is_active === false) return <AccessNotice title="تم إيقاف الحساب" description="تواصل مع مدير النظام لإعادة تفعيل حسابك." retryLabel="إعادة التحقق" />;
    return <>
        <div ref={workspace} tabIndex={-1} className="outline-none" data-auth-workspace="" hidden={isLoading} inert={isLoading} aria-hidden={isLoading || undefined}
            onFocusCapture={event => { if (!isLoading && event.target instanceof HTMLElement) lastFocus.current = event.target; }}>
            <AuthWorkspaceBoundary key={workspaceEpoch}><Layout /></AuthWorkspaceBoundary>
        </div>
        <BlockingDialog.Root open={canRetainWorkspace} modal>
            <BlockingDialog.Portal>
                <BlockingDialog.Overlay className="fixed inset-0 z-[2147483647] bg-background" />
                <BlockingDialog.Content className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center outline-none" dir="rtl"
                    onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}
                    onCloseAutoFocus={event => {
                        event.preventDefault();
                        const target = lastFocus.current;
                        if (target?.isConnected && !target.matches(':disabled')) target.focus(); else workspace.current?.focus();
                    }}>
                    <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-primary" />
                    <BlockingDialog.Title className="text-lg font-semibold">جارٍ التحقق من حسابك…</BlockingDialog.Title>
                    <BlockingDialog.Description>تعديلاتك غير المحفوظة باقية أثناء التحقق. إذا تعذر التحقق قد تحتاج لإعادة إدخالها. انتظر قبل متابعة العمل.</BlockingDialog.Description>
                </BlockingDialog.Content>
            </BlockingDialog.Portal>
        </BlockingDialog.Root>
    </>;
}

