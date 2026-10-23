import { Component, Suspense, type PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

class PageFailureBoundary extends Component<PropsWithChildren, {failed:boolean}> {
    state = {failed:false};
    static getDerivedStateFromError() { return {failed:true}; }
    render() {
        if (this.state.failed) return <section role="alert" className="rounded-xl border p-6 space-y-4">
            <h2 className="text-xl font-semibold">تعذر عرض هذه الصفحة</h2>
            <p>أعد تحميل الصفحة للمحاولة من جديد، أو افتح قسمًا آخر من القائمة. إذا استمرت المشكلة، تواصل مع مدير النظام.</p>
            <Button onClick={() => window.location.reload()}>إعادة تحميل الصفحة</Button>
        </section>;
        return this.props.children;
    }
}

export function PageLoadBoundary({children}:PropsWithChildren) {
    const {pathname} = useLocation();
    // Keep the authenticated shell visible; reset only the failed page on navigation.
    // A full user-initiated reload also clears cached failed dynamic imports.
    return <PageFailureBoundary key={pathname}><Suspense fallback={<p role="status" className="py-8">جارٍ تحميل الصفحة…</p>}>{children}</Suspense></PageFailureBoundary>;
}
