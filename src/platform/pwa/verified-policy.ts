import type { CacheActor } from './api-cache';

export const CACHE_ROLES = ['admin', 'manager', 'accountant', 'inventory_officer', 'production_officer', 'viewer'] as const;
export type CacheRole = typeof CACHE_ROLES[number];
export interface VerifiedCachePolicy extends CacheActor { role: CacheRole }
const MARKER = 'factory-policy/';
let verified: VerifiedCachePolicy | null = null;

// A client partition hint, never authorization. Only the network profile check installs it.
export function installVerifiedCachePolicy(policy: VerifiedCachePolicy | null): void { verified = policy; }
export function currentVerifiedCachePolicy(): VerifiedCachePolicy | null { return verified; }
export function cachePolicyMarker(policy: VerifiedCachePolicy): string {
    return MARKER + encodeURIComponent(JSON.stringify([policy.issuer, policy.subject, policy.role]));
}
export function parseCachePolicy(clientInfo: string | null, actor: CacheActor): VerifiedCachePolicy | null {
    const markers = clientInfo?.split(/\s+/).filter(part => part.startsWith(MARKER));
    if (markers?.length !== 1) return null;
    try {
        const value: unknown = JSON.parse(decodeURIComponent(markers[0].slice(MARKER.length)));
        if (!Array.isArray(value) || value.length !== 3 || value[0] !== actor.issuer || value[1] !== actor.subject || !CACHE_ROLES.includes(value[2])) return null;
        return { ...actor, role: value[2] };
    } catch { return null; }
}

export function policyRequestHeaders(input: RequestInfo | URL, options?: RequestInit): Headers {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options?.headers).forEach((value, key) => headers.set(key, value));
    const info = (headers.get('X-Client-Info') ?? '').split(/\s+/).filter(part => part && !part.startsWith(MARKER));
    const method = (options?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (verified && method === 'GET') info.push(cachePolicyMarker(verified));
    headers.set('X-Client-Info', info.join(' '));
    return headers;
}
