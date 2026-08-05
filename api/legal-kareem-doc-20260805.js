export default async function handler(req, res) {
  if (req.query.key !== 'L7mQ2vR8xP4nK9sD') {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const allowed = new Set(['receipts', 'custody', 'stock', 'attendance', 'credit']);
  const doc = allowed.has(String(req.query.doc)) ? String(req.query.doc) : 'receipts';
  try {
    const url = `https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-html-20260805?token=gq8fRxP2jV4mN7sQ9wK3&doc=${encodeURIComponent(doc)}`;
    const upstream = await fetch(url);
    const body = await upstream.arrayBuffer();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(body));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(error) }));
  }
}
