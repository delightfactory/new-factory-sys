export function mcpAccessIsCurrent(expiry: string, now = Date.now()): boolean {
  if (expiry === 'infinity') return true;
  const timestamp = Date.parse(expiry);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function mcpAccessExpiryLabel(expiry: string): string {
  return expiry === 'infinity'
    ? 'مستمر حتى إلغاء الوصول'
    : new Date(expiry).toLocaleString('ar');
}
