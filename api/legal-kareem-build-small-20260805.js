import crypto from 'node:crypto';
import chromium from '@sparticuz/chromium';
import JSZip from 'jszip';
import puppeteer from 'puppeteer-core';

export const config = { maxDuration: 300 };
const KEY = 'BuildSmallKareemDocs20260805';
const UPLOAD_URL = 'https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-upload-20260805';
const HTML_URL = 'https://ozthzccqudrudicnneuu.supabase.co/functions/v1/legal-kareem-html-20260805?token=gq8fRxP2jV4mN7sQ9wK3&doc=';
const docs = [
  ['receipts','01_receipts.pdf','01_كشف_إيصالات_الدفع_كريم_شيتوس.pdf'],
  ['custody','02_custody.pdf','02_كشف_حركة_العهدة_النقدية_كريم_شيتوس.pdf'],
  ['stock','03_stock.pdf','03_كشف_حركة_مخزن_كريم_شيتوس.pdf'],
  ['attendance','04_attendance.pdf','04_كشف_الحضور_والانصراف_كريم_شيتوس.pdf'],
  ['credit','05_credit.pdf','05_كشف_تطور_الائتمان_عملاء_كريم_شيتوس.pdf'],
];
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function upload(name,type,body,key){
  const r=await fetch(UPLOAD_URL,{method:'POST',headers:{'content-type':type,'x-filename':name,'x-upload-key':key},body});
  if(!r.ok) throw new Error(`upload ${name}: ${r.status} ${await r.text()}`);
  return r.json();
}
export default async function handler(req,res){
  if(req.query.key!==KEY){res.statusCode=404;return res.end('Not found');}
  const uploadKey=String(req.query.uploadKey||'');
  let browser;
  try{
    browser=await puppeteer.launch({args:chromium.args,defaultViewport:chromium.defaultViewport,executablePath:await chromium.executablePath(),headless:chromium.headless});
    const made=[];
    for(const [doc,object,archive] of docs){
      const r=await fetch(HTML_URL+doc); if(!r.ok) throw new Error(`html ${doc}: ${r.status}`);
      const page=await browser.newPage();
      await page.setContent(await r.text(),{waitUntil:'networkidle0',timeout:120000});
      await page.emulateMediaType('print');
      const buffer=Buffer.from(await page.pdf({format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font-family:Arial,Tahoma,sans-serif;font-size:7px;width:100%;text-align:center;color:#6b7280"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{top:'8mm',right:'6mm',bottom:'12mm',left:'6mm'}}));
      await page.close(); made.push({doc,object,archive,buffer,bytes:buffer.length,sha256:hash(buffer)});
    }
    const generatedAt=new Date().toISOString();
    const manifest=Buffer.from(['DELIGHT — FILE INTEGRITY MANIFEST','Employee: Kareem Shetos / EMP-00001','Period: 2026-04-01 through 2026-07-15',`Generated UTC: ${generatedAt}`,'',...made.map(x=>`${x.sha256}  ${x.archive}`),''].join('\n'),'utf8');
    const summary={generated_at:generatedAt,record_counts:{receipts:335,custody:383,stock:880,attendance_logs:95,attendance_days:49,credit_days:106},pdfs:made.map(({archive,bytes,sha256})=>({file:archive,bytes,sha256}))};
    const zip=new JSZip(); made.forEach(x=>zip.file(x.archive,x.buffer)); zip.file('06_SHA256_بصمات_سلامة_الملفات.txt',manifest); zip.file('build_summary.json',JSON.stringify(summary,null,2));
    const zipBuffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:9}});
    summary.zip={file:'مستندات_كريم_شيتوس_للنيابة.zip',bytes:zipBuffer.length,sha256:hash(zipBuffer)};
    for(const x of made) await upload(x.object,'application/pdf',x.buffer,uploadKey);
    await upload('06_manifest.txt','text/plain',manifest,uploadKey);
    await upload('build_summary.json','application/json',Buffer.from(JSON.stringify(summary,null,2)),uploadKey);
    await upload('kareem_legal_documents.zip','application/zip',zipBuffer,uploadKey);
    res.setHeader('content-type','application/json; charset=utf-8'); res.end(JSON.stringify(summary));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e),stack:e?.stack}));}
  finally{if(browser) await browser.close().catch(()=>{});}
}
