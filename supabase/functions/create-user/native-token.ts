// Call only AFTER Supabase Auth getUser(token) has validated the token.
// This adds an audience/client boundary; it does not verify JWT signatures.
export function isNativeAccessToken(token: string, verifiedUserId: string, now = Date.now()): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(raw));
    return claims.sub === verifiedUserId && claims.role === 'authenticated' &&
      claims.aud === 'authenticated' && claims.client_id == null &&
      Number.isFinite(claims.exp) && claims.exp * 1000 > now;
  } catch {
    return false;
  }
}
