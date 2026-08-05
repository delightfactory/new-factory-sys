const FILES = {
  receipts: ['01_receipts.pdf', 'application/pdf'],
  custody: ['02_custody.pdf', 'application/pdf'],
  stock: ['03_stock.pdf', 'application/pdf'],
  attendance: ['04_attendance.pdf', 'application/pdf'],
  credit: ['05_credit.pdf', 'application/pdf'],
  manifest: ['06_manifest.txt', 'text/plain; charset=utf-8'],
  summary: ['build_summary.json', 'application/json; charset=utf-8'],
  zip: ['kareem_legal_documents.zip', 'application/zip'],
};

export default async function handler(req, res) {
  if (req.query.key !== 'ProxyKareemDocs20260805') {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const item = FILES[String(req.query.file || '')];
  if (!item) {
    res.statusCode = 400;
    return res.end('Invalid file');
  }
  const [name, contentType] = item;
  const upstream = await fetch(`https://ozthzccqudrudicnneuu.supabase.co/storage/v1/object/public/legal-kareem-20260805/${name}`);
  if (!upstream.ok) {
    res.statusCode = upstream.status;
    return res.end(await upstream.text());
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.end(bytes);
}
