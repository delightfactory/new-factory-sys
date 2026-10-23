import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { actorApiCacheName, obsoleteApiCaches } from '@/platform/pwa/api-cache';
import { currentVerifiedCachePolicy } from '@/platform/pwa/verified-policy';

export function ActorQueryBoundary({ children }: { children: ReactNode }) {
    const { workspaceEpoch, authorizationEpoch, session, profile, isLoading } = useAuth();
    return <ActorQueries key={`${workspaceEpoch}:${authorizationEpoch}`} token={session?.access_token} canPrune={!isLoading} policyRole={profile?.role}>{children}</ActorQueries>;
}

function ActorQueries({ children, token, canPrune, policyRole }: { children: ReactNode; token?: string; canPrune: boolean; policyRole?: string }) {
    const [client] = useState(() => new QueryClient());
    useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
    useEffect(() => {
        if (!canPrune || !('caches' in window)) return;
        let cancelled = false;
        void (async () => {
            const identity = currentVerifiedCachePolicy();
            const keep = identity ? await actorApiCacheName(identity) : null;
            const names = await caches.keys();
            for (const name of obsoleteApiCaches(names, keep)) {
                if (cancelled) return;
                await caches.delete(name);
            }
        })().catch(() => { console.warn('FACTORY_API_CACHE_CLEANUP_FAILED'); });
        return () => { cancelled = true; };
    }, [token, canPrune, policyRole]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
