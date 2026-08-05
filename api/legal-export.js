export default async function handler(req, res) {
  try {
    const upstream = await fetch('https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-export-20260805?token=o5wmDIEUoXw9DT8fa_6fPFfCqzzhRjMhDKOromlytmQ');
    const body = await upstream.arrayBuffer();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(body));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(error) }));
  }
}
