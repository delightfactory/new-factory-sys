import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = {
  maxDuration: 300,
};

const documents = {
  receipts: '01_كشف_إيصالات_الدفع_كريم_شيتوس.pdf',
  custody: '02_كشف_حركة_العهدة_النقدية_كريم_شيتوس.pdf',
  stock: '03_كشف_حركة_مخزن_كريم_شيتوس.pdf',
  attendance: '04_كشف_الحضور_والانصراف_كريم_شيتوس.pdf',
  credit: '05_كشف_تطور_الائتمان_عملاء_كريم_شيتوس.pdf',
};

export default async function handler(req, res) {
  if (req.query.key !== 'P9wK3mN7sQ4vR8xL') {
    res.statusCode = 404;
    return res.end('Not found');
  }

  const doc = String(req.query.doc || 'receipts');
  if (!Object.prototype.hasOwnProperty.call(documents, doc)) {
    res.statusCode = 400;
    return res.end('Invalid document');
  }

  let browser;
  try {
    const sourceUrl = `https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-html-20260805?token=gq8fRxP2jV4mN7sQ9wK3&doc=${encodeURIComponent(doc)}`;
    const source = await fetch(sourceUrl);
    if (!source.ok) throw new Error(`Source HTML failed: ${source.status}`);
    const html = await source.text();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '8mm', right: '6mm', bottom: '11mm', left: '6mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: '<div style="font-family:Arial,Tahoma,sans-serif;font-size:7px;width:100%;text-align:center;color:#6b7280;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });

    const filename = documents[doc];
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${doc}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.end(Buffer.from(pdf));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: String(error), stack: error?.stack }));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
