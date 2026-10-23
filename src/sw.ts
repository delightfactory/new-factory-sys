/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { actorApiCacheName, isBusinessApiRead, LEGACY_API_CACHE, parseCacheActor } from './platform/pwa/api-cache';
import { assertHostedApiUrl } from './platform/hosted-environment';
import { parseCachePolicy } from './platform/pwa/verified-policy';
import { cacheProvenanceResponse } from './platform/pwa/cache-provenance';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string | null }> };
const apiOrigin = assertHostedApiUrl(import.meta.env.VITE_SUPABASE_URL).origin;

void self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
self.addEventListener('activate', event => { event.waitUntil(caches.delete(LEGACY_API_CACHE)); });

const strategies = new Map<string, NetworkFirst>();
// Auth, profiles, RPCs, writes and anonymous requests always use the network.
registerRoute(({ url, request }) => isBusinessApiRead(url, request.method, apiOrigin), async options => {
    const actor = parseCacheActor(options.request.headers.get('Authorization'));
    if (!actor) return fetch(options.request);
    const policy = parseCachePolicy(options.request.headers.get('X-Client-Info'), actor);
    if (!policy) return fetch(options.request);
    const cacheName = await actorApiCacheName(policy);
    let strategy = strategies.get(cacheName);
    if (!strategy) {
        strategy = new NetworkFirst({ cacheName, plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            {
                cacheWillUpdate: async ({ response }) => response.status === 200 ? cacheProvenanceResponse(response, 'network') : null,
                cachedResponseWillBeUsed: async ({ cachedResponse }) => cachedResponse ? cacheProvenanceResponse(cachedResponse, 'cache') : null,
            },
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
        ] });
        strategies.set(cacheName, strategy);
    }
    // An in-flight response stays in its initiating actor's namespace.
    return strategy.handle(options);
});
