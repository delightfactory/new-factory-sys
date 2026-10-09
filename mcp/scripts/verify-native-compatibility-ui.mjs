// Actual production dialog/services + local PostgreSQL SQL. Provider HTTP and
// tokens are synthetic. No hosted Auth or production request is made.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { initializeNativeDatabase } from '../tests/native-fixture.mjs';
import { actor, session } from '../tests/fixture.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(join(root,'package.json'));
const out=resolve(root,'../native-compatibility-ui');mkdirSync(out,{recursive:true});
const db=new PGlite();await initializeNativeDatabase(db);
const claims={sub:actor,session_id:session,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
const token=[{alg:'HS256',typ:'JWT'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.'+Buffer.from('local-signature').toString('base64url');
const user={id:actor,email:'local@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
async function rpc(name,payload,headers={'x-client-info':'factory-native-compat/1'}){
 await db.exec('begin');try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[actor,JSON.stringify(claims),JSON.stringify(headers)]);
  await db.exec('set local role authenticated');
  const query=name==='factory_native_write'?'select factory_native_write($1,$2::jsonb,$3::uuid) value':'select factory_native_financial_reversal_plan($1) value';
  const values=name==='factory_native_write'?[payload.p_action,JSON.stringify(payload.p_payload),payload.p_request_id]:[payload.p_id];
  const result=(await db.query(query,values)).rows[0].value;await db.exec('commit');return result;
 }catch(error){await db.exec('rollback');throw error;}
}
async function command(action,payload){const result=(await rpc('factory_native_write',{p_action:action,p_payload:payload,p_request_id:randomUUID()})).record;return result.record??result;}
const a=await command('create_treasury',{name:'الخزنة الأولى',type:'cash',opening_balance:100});
const b=await command('create_treasury',{name:'الخزنة الثانية',type:'cash',opening_balance:100});
async function transfer(){await db.query('select transfer_between_treasuries($1,$2,20,$3)',[a.id,b.id,'Local transfer']);return (await db.query("select id from financial_transactions where category='transfer_out' order by id desc limit 1")).rows[0].id;}
let currentId=await transfer();
let bundle;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(url.pathname==='/mock/auth/v1/user')return send(200,user);
 if(url.pathname.startsWith('/mock/rest/v1/rpc/')){
  assert.equal(req.headers.authorization,`Bearer ${token}`);
  assert.equal(req.headers['x-client-info'],'factory-native-compat/1','Current client must override, not concatenate, the SDK compatibility header');
  const name=url.pathname.split('/').pop();assert.ok(['factory_native_write','factory_native_financial_reversal_plan'].includes(name));
  let raw='';for await(const chunk of req){raw+=chunk;assert.ok(raw.length<100000);}
  return send(200,await rpc(name,JSON.parse(raw),{'x-client-info':req.headers['x-client-info']}));
 }
 if(url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(bundle);}
 if(url.pathname==='/app.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(readFileSync(join(out,'app.css')));}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
 }catch(error){console.log(JSON.stringify({localRequestError:error.message}));res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{FinancialReversalDialog}from'./src/components/financial/FinancialReversalDialog';import{supabase}from'./src/integrations/supabase/client';import{InventoryService}from'./src/services/InventoryService';window.inventory=InventoryService;await supabase.auth.setSession({access_token:${JSON.stringify(token)},refresh_token:'synthetic-local-only'});const root=createRoot(document.getElementById('root'));window.show=(id)=>root.render(React.createElement(QueryClientProvider,{client:new QueryClient({defaultOptions:{queries:{retry:false}}})},React.createElement(FinancialReversalDialog,{key:id,transactionId:id,onClose:()=>root.render(React.createElement('p',null,'أغلقت')),onSuccess:()=>root.render(React.createElement('p',{role:'status'},'ألغيت الحركة وحفظت الأرصدة'))})));window.show(${currentId});`;
const productionEntry=`import{Toaster}from'sonner';window.showProduction=(id)=>root.render(React.createElement(React.Fragment,null,React.createElement(Toaster,{richColors:true,duration:10000}),React.createElement('button',{id:'complete-production',onClick:async()=>{await InventoryService.completeProductionOrder(id);document.querySelector('#production-status').textContent='completed';}},'Complete'),React.createElement('p',{id:'production-status'},'pending')));`;
const built=await require('esbuild').build({stdin:{contents:entry+productionEntry,resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',tsconfig:join(root,'tsconfig.app.json'),define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:origin+'/mock',VITE_SUPABASE_ANON_KEY:'synthetic-local-public',DEV:true,PROD:false})},logLevel:'warning'});
bundle=built.outputFiles[0].contents;
const config=(await import(pathToFileURL(join(root,'tailwind.config.js')))).default;config.content=[join(root,'src/**/*.{tsx,ts}')];config.plugins=[require('tailwindcss-animate')];
const css=await require('postcss')([require('tailwindcss')(config),require('autoprefixer')]).process(readFileSync(join(root,'src/index.css'),'utf8'),{from:join(root,'src/index.css')});writeFileSync(join(out,'app.css'),css.css);
let browser;
try{
 browser=await require('puppeteer-core').launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--disable-gpu','--no-first-run','--disable-background-networking']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log(JSON.stringify({browserError:error.message}));});
 await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith(origin)||request.url().startsWith('data:')?request.continue():request.abort());
 await page.setViewport({width:390,height:844});await page.goto(origin);try{await page.waitForSelector('[role="combobox"]',{timeout:10000});}catch(error){console.log(JSON.stringify({visibleBody:await page.$eval('body',e=>e.innerText),errors}));await page.screenshot({path:join(out,'startup-failure.png')});throw error;}
 for(const width of [390,768,1280]){await page.setViewport({width,height:844});await page.screenshot({path:join(out,`dialog-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Dialog must not overflow viewport');}
 async function selectPair(){await page.click('[role="combobox"]');await page.waitForSelector('[cmdk-item]');await page.click('[cmdk-item]');await page.waitForFunction(()=>!document.querySelector('[cmdk-item]'));}
 async function confirm(){await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('من الخزينتين')&&!b.disabled));await page.evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('من الخزينتين')).click());}
 await selectPair();await confirm();await page.waitForFunction(()=>document.body.textContent.includes('ألغيت الحركة وحفظت الأرصدة'));
 assert.deepEqual((await db.query('select balance::int balance from treasuries where id in ($1,$2) order by id',[a.id,b.id])).rows.map(x=>x.balance),[100,100]);
 assert.equal((await db.query('select count(*)::int count from financial_transactions')).rows[0].count,0);
 currentId=await transfer();await db.query('update treasuries set balance=0 where id=$1',[b.id]);await page.evaluate(id=>window.show(id),currentId);await page.waitForSelector('[role="combobox"]');await selectPair();
 const selected=await page.$eval('[role="combobox"]',e=>e.textContent);await confirm();await page.waitForSelector('[role="alert"]');
 assert.equal(await page.$eval('[role="combobox"]',e=>e.textContent),selected,'Failure must preserve the explicit selected leg');
 assert.deepEqual((await db.query('select balance::int balance from treasuries where id in ($1,$2) order by id',[a.id,b.id])).rows.map(x=>x.balance),[80,0]);
 assert.equal((await db.query('select count(*)::int count from financial_transactions')).rows[0].count,2);
 await page.screenshot({path:join(out,'dialog-failure.png')});assert.deepEqual(errors,[]);
 await db.exec('update raw_materials set quantity=0 where id=1');
 const production=await command('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]});
 await page.setViewport({width:390,height:844});await page.evaluate(id=>window.showProduction(id),production.id);await page.waitForSelector('#complete-production');await page.click('#complete-production');
 await page.waitForFunction(()=>document.querySelector('#production-status').textContent==='completed');
 await page.waitForFunction(()=>document.body.textContent.includes('أرصدة مخزون سالبة')&&document.body.textContent.includes('Raw: -1 kg'));
 await page.waitForFunction(()=>{const toast=document.querySelector('[data-sonner-toast]');if(!toast)return false;const box=toast.getBoundingClientRect();return box.top>=0&&box.bottom<innerHeight&&Number(getComputedStyle(toast).opacity)>.99;});
 assert.equal((await db.query('select quantity::float8 qty from raw_materials where id=1')).rows[0].qty,-1);
 assert.equal((await db.query('select total_cost::float8 cost from production_orders where id=$1',[production.id])).rows[0].cost,2);
 await page.screenshot({path:join(out,'production-warning.png')});assert.deepEqual(errors,[]);
 const evidence={passed:true,syntheticAuth:true,actualProductionDialog:true,actualNativeSql:true,viewports:[390,768,1280],transferBothLegsRestored:true,failurePreservesSelection:true,failureBalancesUnchanged:true,actualProductionService:true,actualNegativeStockToast:true,productionRawQuantity:-1,productionOrderCost:2};
 writeFileSync(join(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser?.close();await new Promise(r=>server.close(r));await db.close();}
