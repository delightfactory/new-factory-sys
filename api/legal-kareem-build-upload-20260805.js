import crypto from 'node:crypto';
import chromium from '@sparticuz/chromium';
import JSZip from 'jszip';
import puppeteer from 'puppeteer-core';

export const config = { maxDuration: 300 };

const BUILD_KEY = 'BuildKareemDocs20260805';
const DOCS = [
  { key: 'receipts', object: '01_receipts.pdf', archive: '01_كشف_إيصالات_الدفع_كريم_شيتوس.pdf' },
  { key: 'custody', object: '02_custody.pdf', archive: '02_كشف_حركة_العهدة_النقدية_كريم_شيتوس.pdf' },
  { key: 'stock', object: '03_stock.pdf', archive: '03_كشف_حركة_مخزن_كريم_شيتوس.pdf' },
  { key: 'attendance', object: '04_attendance.pdf', archive: '04_كشف_الحضور_والانصراف_كريم_شيتوس.pdf' },
  { key: 'credit', object: '05_credit.pdf', archive: '05_كشف_تطور_الائتمان_عملاء_كريم_شيتوس.pdf' },
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function upload(filename, contentType, buffer, uploadKey) {
  const response = await fetch('https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-upload-20260805', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-filename': filename,
      'x-upload-key': uploadKey,
    },
    body: buffer,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Upload ${filename} failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.query.key !== BUILD_KEY) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  const uploadKey = String(req.query.uploadKey || '');
  if (!uploadKey) {
    res.statusCode = 400;
    return res.end('Missing upload key');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const generated = [];
    for (const doc of DOCS) {
      const htmlResponse = await fetch(`https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-html-20260805?token=gq8fRxP2jV4mN7sQ9wK3&doc=${doc.key}`);
      if (!htmlResponse.ok) throw new Error(`HTML ${doc.key} failed: ${htmlResponse.status}`);
      let html = await htmlResponse.text();
      html = html.replace('</head>', '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet"></head>');

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 150000 });
      await page.emulateMediaType('print');
      const bytes = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="font-family:Arial,Tahoma,sans-serif;font-size:7px;width:100%;text-align:center;color:#6b7280;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margin: { top: '8mm', right: '6mm', bottom: '12mm', left: '6mm' },
      });
      await page.close();
      const buffer = Buffer.from(bytes);
      generated.push({ ...doc, buffer, bytes: buffer.length, sha256: sha256(buffer) });
    }

    const generatedAt = new Date().toISOString();
    const manifestLines = [
      'DELIGHT — FILE INTEGRITY MANIFEST',
      'Employee: Kareem Shetos / EMP-00001',
      'Period: 2026-04-01 through 2026-07-15',
      `Generated UTC: ${generatedAt}`,
      '',
      ...generated.map(item => `${item.sha256}  ${item.archive}`),
      '',
    ];
    const manifest = Buffer.from(manifestLines.join('\n'), 'utf8');

    const summaryObject = {
      generated_at: generatedAt,
      record_counts: { receipts: 335, custody: 383, stock: 880, attendance_logs: 95, attendance_days: 49, credit_days: 106 },
      pdfs: generated.map(({ archive, bytes, sha256 }) => ({ file: archive, bytes, sha256 })),
    };
    const summary = Buffer.from(JSON.stringify(summaryObject, null, 2), 'utf8');

    const zip = new JSZip();
    for (const item of generated) zip.file(item.archive, item.buffer);
    zip.file('06_SHA256_بصمات_سلامة_الملفات.txt', manifest);
    zip.file('build_summary.json', summary);
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    summaryObject.zip = { file: 'مستندات_كريم_شيتوس_للنيابة.zip', bytes: zipBuffer.length, sha256: sha256(zipBuffer) };
    const finalSummary = Buffer.from(JSON.stringify(summaryObject, null, 2), 'utf8');

    const uploads = [];
    for (const item of generated) uploads.push(await upload(item.object, 'application/pdf', item.buffer, uploadKey));
    uploads.push(await upload('06_manifest.txt', 'text/plain; charset=utf-8', manifest, uploadKey));
    uploads.push(await upload('build_summary.json', 'application/json; charset=utf-8', finalSummary, uploadKey));
    uploads.push(await upload('kareem_legal_documents.zip', 'application/zip', zipBuffer, uploadKey));

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.end(JSON.stringify({ success: true, generated: summaryObject, uploads }, null, 2));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ success: false, error: String(error), stack: error?.stack }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
