export const API_CACHE_PREFIX = 'factory-api:v3:';
export const LEGACY_API_CACHE = 'supabase-api-cache';
export interface CacheActor { issuer: string; subject: string }

// Partitioning only. The server remains responsible for authenticating the JWT.
export function parseCacheActor(authorization: string | null): CacheActor | null {
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
    if (!match) return null;
    try {
        const part = match[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
        if (claims.role !== 'authenticated' || typeof claims.iss !== 'string' || !claims.iss ||
            typeof claims.sub !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.sub)) return null;
        return { issuer: claims.iss, subject: claims.sub };
    } catch { return null; }
}

export async function actorApiCacheName(actor: CacheActor & { role: string }): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify([actor.issuer, actor.subject, actor.role]));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return API_CACHE_PREFIX + Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

export function isBusinessApiRead(url: URL, method: string, apiOrigin: string): boolean {
    if (url.origin !== apiOrigin || method !== 'GET') return false;
    const table = /^\/rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(url.pathname)?.[1];
    return !!table && table !== 'profiles' && table !== 'rpc';
}

export function obsoleteApiCaches(names: string[], keep: string | null): string[] {
    return names.filter(name => name === LEGACY_API_CACHE || name.startsWith('factory-api:v2:') || name.startsWith(API_CACHE_PREFIX) && name !== keep);
}
