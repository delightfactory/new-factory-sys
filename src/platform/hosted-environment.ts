export const hostedProjectRef = 'cgqunqczuvwfvuzlsvyy';
export function assertHostedApiUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== hostedProjectRef + '.supabase.co' || url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('FACTORY_HOSTED_API_REQUIRED');
  return url;
}
export function assertHostedPublicKey(key: string): void {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return;
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error();
    const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if (claims.role !== 'anon' || claims.iss !== 'supabase' || claims.ref !== hostedProjectRef) throw new Error();
  } catch { throw new Error('FACTORY_HOSTED_PUBLIC_KEY_REQUIRED'); }
}
export function assertHostedEnvironment(env: Record<string, string>): void {
  if(Object.keys(env).some(name=>name.startsWith('VITE_')&&!['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_MCP_APP_ORIGIN','VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG'].includes(name))) throw new Error('FACTORY_UNEXPECTED_PUBLIC_ENV');
  if(env.VITE_MCP_APP_ORIGIN !== 'https://new-factory-sys.vercel.app') throw new Error('FACTORY_HOSTED_MCP_ORIGIN_REQUIRED');
  assertHostedApiUrl(env.VITE_SUPABASE_URL); assertHostedPublicKey(env.VITE_SUPABASE_ANON_KEY);
}
export const hostedConnectPolicy = "default-src 'self'; connect-src 'self' https://cgqunqczuvwfvuzlsvyy.supabase.co wss://cgqunqczuvwfvuzlsvyy.supabase.co; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";
