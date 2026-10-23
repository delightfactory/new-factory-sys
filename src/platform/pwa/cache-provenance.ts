export const CACHE_READ_SOURCE = 'X-Factory-Read-Source';
export const CACHE_STORED_AT = 'X-Factory-Stored-At';
export interface CacheReadNotice { oldestStoredAt: number | null; unknownTime: boolean }
let notice: CacheReadNotice | null = null;
let readEpoch = 0;
export function cacheReadEpoch(): number { return readEpoch; }
const listeners = new Set<() => void>();
export function getCacheReadNotice(): CacheReadNotice | null { return notice; }
export function subscribeCacheReadNotice(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function resetCacheReadNotice(): void {
    readEpoch++;
    if (!notice) return;
    notice = null;
    listeners.forEach(listener => listener());
}
export function recordCachedRead(response: Response): void {
    if (response.headers.get(CACHE_READ_SOURCE) !== 'cache') return;
    const raw = response.headers.get(CACHE_STORED_AT);
    const parsed = raw ? Number(raw) : NaN;
    const storedAt = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= Date.now() ? parsed : null;
    const previous = notice;
    const oldestStoredAt = storedAt === null ? previous?.oldestStoredAt ?? null : Math.min(storedAt, previous?.oldestStoredAt ?? storedAt);
    const unknownTime = storedAt === null || previous?.unknownTime === true;
    if (previous && oldestStoredAt === previous.oldestStoredAt && unknownTime === previous.unknownTime) return;
    notice = { oldestStoredAt, unknownTime };
    listeners.forEach(listener => listener());
}

// Network responses are stamped only in the stored copy; fallback is marked on use.
export function cacheProvenanceResponse(response: Response, source: 'network' | 'cache', now = Date.now()): Response {
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
    headers.delete(CACHE_READ_SOURCE);
    if (source === 'network') headers.set(CACHE_STORED_AT, String(now));
    else headers.set(CACHE_READ_SOURCE, 'cache');
    const exposed = new Set((headers.get('Access-Control-Expose-Headers') ?? '').split(',').map(value => value.trim()).filter(Boolean));
    exposed.add(CACHE_READ_SOURCE);
    exposed.add(CACHE_STORED_AT);
    headers.set('Access-Control-Expose-Headers', [...exposed].join(', '));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
