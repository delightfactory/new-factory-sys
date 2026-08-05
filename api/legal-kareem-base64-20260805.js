import crypto from 'node:crypto';

export const config = { maxDuration: 300 };

const KEY = 'ChunkKareemDocs20260805';
const FILES = {
  zip: 'kareem_legal_documents.zip',
};

export default async function handler(req, res) {
  if (req.query.key !== KEY) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  const fileKey = String(req.query.file || 'zip');
  const filename = FILES[fileKey];
  if (!filename) {
    res.statusCode = 400;
    return res.end('Invalid file');
  }

  const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
  const requestedLength = Math.max(1, Number.parseInt(String(req.query.length || '50000'), 10) || 50000);
  const length = Math.min(requestedLength, 100000);

  try {
    const upstream = await fetch(`https://ozthzccqudrudicnneuu.supabase.co/storage/v1/object/public/legal-kareem-20260805/${filename}`);
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      return res.end(await upstream.text());
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const base64 = buffer.toString('base64');
    const chunk = base64.slice(offset, offset + length);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({
      filename,
      byteLength: buffer.length,
      base64Length: base64.length,
      sha256,
      offset,
      requestedLength: length,
      chunkLength: chunk.length,
      done: offset + chunk.length >= base64.length,
      chunk,
    }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: String(error), stack: error?.stack }));
  }
}
