import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton } from '@/components/ui/loading-skeleton';

interface CatalogQueryState {
    data?: unknown[];
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
}

export function CatalogReadState({ query, entity, onRetry, children }: {
    query: CatalogQueryState; entity: string; onRetry: () => void; children: ReactNode;
}) {
    const hasData = query.data !== undefined;
    return <section aria-label={entity} aria-busy={query.isFetching} className="space-y-4 min-w-0">
        <div>
            {query.isPending && !hasData && <div role="status"><span className="sr-only">جارٍ تحميل {entity}…</span><CardGridSkeleton count={3} /></div>}
            {query.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
                <p className="min-w-0 text-sm">{hasData ? 'تعذر تحديث القائمة. المعروض آخر نسخة حُمّلت في هذه الصفحة.' : `تعذر تحميل ${entity}. أعد المحاولة لعرض البيانات.`}</p>
                <Button variant="outline" disabled={query.isFetching} onClick={onRetry}>إعادة المحاولة</Button>
            </div>}
            {query.isFetching && hasData && <p role="status" className="text-sm text-muted-foreground">جارٍ تحديث القائمة…</p>}
            {query.isFetching && !hasData && !query.isPending && <p role="status" className="text-sm text-muted-foreground">جارٍ إعادة المحاولة…</p>}
        </div>
        <div>{hasData && children}</div>
    </section>;
}
