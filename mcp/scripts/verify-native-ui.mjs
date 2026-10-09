// Disposable loopback UI harness. It builds the actual app and executes its
// native factory_write RPC against actual local SQL. Auth/provider HTTP here is
// synthetic; this is not a substitute for hosted Supabase/PostgREST verification.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { fixtureSql, actor, session } from '../tests/fixture.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dependencyRoot=process.env.FACTORY_UI_DEPENDENCY_ROOT;
if(!dependencyRoot)throw Error('Set FACTORY_UI_DEPENDENCY_ROOT to an existing dependency checkout; no install is performed.');
const require=createRequire(join(dependencyRoot,'package.json'));
const esbuild=require('esbuild');
const out=resolve(root,'../factory-ui-preview');mkdirSync(out,{recursive:true});
const port=4179,origin=`http://127.0.0.1:${port}`;
const user={id:actor,email:'ui@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{full_name:'Local UI Test'},created_at:new Date().toISOString()};
const jwtClaims={sub:actor,session_id:session,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
const token=[{alg:'HS256',typ:'JWT'},jwtClaims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
await esbuild.build({entryPoints:[join(root,'src/main.tsx')],bundle:true,outfile:join(out,'app.js'),platform:'browser',format:'esm',jsx:'automatic',target:'es2022',tsconfig:join(root,'tsconfig.app.json'),
 define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:origin+'/mock',VITE_SUPABASE_ANON_KEY:'synthetic-public-test-only',DEV:true,PROD:false,MODE:'development'})},
 nodePaths:[join(dependencyRoot,'node_modules')],loader:{'.svg':'dataurl','.png':'dataurl','.woff2':'dataurl'},logLevel:'warning'});
const tailwindSource=readFileSync(join(root,'tailwind.config.js'),'utf8').replace('plugins: [import("tailwindcss-animate")]', 'plugins: []');
const tailwindConfig=(await import('data:text/javascript;base64,'+Buffer.from(tailwindSource).toString('base64'))).default;
tailwindConfig.plugins=[require('tailwindcss-animate')];
tailwindConfig.content=[join(root,'index.html'),join(root,'src/**/*.{js,ts,jsx,tsx}')];
const compiledCss=await require('postcss')([require('tailwindcss')(tailwindConfig),require('autoprefixer')]).process(readFileSync(join(out,'app.css'),'utf8'),{from:join(out,'app.css')});
writeFileSync(join(out,'app.css'),compiledCss.css);
const css=existsSync(join(out,'app.css'))?'<link rel="stylesheet" href="/app.css">':'';
writeFileSync(join(out,'index.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Factory isolated UI verification</title>${css}<div id="root"></div><script type="module" src="/app.js"></script></html>`);
if(process.argv.includes('--build-only')){console.log('Rebuilt actual UI bundle without restarting disposable database.');process.exit(0);}
const db=new PGlite();await db.exec(fixtureSql());await db.exec(readFileSync(join(root,'supabase/migrations/20261009140827_comprehensive_mcp_operations.sql'),'utf8'));
await db.query('update profiles set full_name=$1 where id=$2',['Local UI Test',actor]);
const allowed=(await db.query('select factory_private.business_tables() tables')).rows[0].tables.concat(['profiles','audit_logs']);
let tail=Promise.resolve();let commandCount=0;
async function serial(fn){const before=tail;let unlock;tail=new Promise(r=>unlock=r);await before;try{return await fn();}finally{unlock();}}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const part of req){text+=part;if(text.length>1000000)throw Error('Body limit');}return text?JSON.parse(text):{};}
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/mock/auth/v1/token'){await body(req);return send(res,200,{access_token:token,refresh_token:'synthetic-local-refresh',token_type:'bearer',expires_in:3600,user});}
 if(url.pathname==='/mock/auth/v1/user')return send(res,200,user);
 if(url.pathname==='/mock/auth/v1/logout')return send(res,200,{});
 if(url.pathname.startsWith('/mock/rest/v1/rpc/')){
  if(req.headers.authorization!==`Bearer ${token}`)return send(res,401,{message:'Native session required'});
  const name=url.pathname.split('/').pop(),payload=await body(req);
  if(name==='get_next_code')return send(res,200,`${payload.prefix}-UI-100`);
  if(name!=='factory_write')return send(res,404,{message:'Synthetic harness does not implement this read RPC'});
  const result=await serial(async()=>{await db.exec('begin');try{
   await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify(jwtClaims)]);
   await db.exec('set local role authenticated');
   const value=(await db.query('select factory_write($1,$2::jsonb,$3::uuid) value',[payload.p_action,JSON.stringify(payload.p_payload),payload.p_request_id])).rows[0].value;
   await db.exec('commit');commandCount++;console.log(JSON.stringify({action:payload.p_action,id:value.record.id,status:value.record.status,commandCount}));return value;
  }catch(error){await db.exec('rollback');throw error;}});return send(res,200,result);
 }
 if(url.pathname.startsWith('/mock/rest/v1/')){
  if(req.method!=='GET')return send(res,405,{message:'Only native shared commands may write in this harness'});
  const table=url.pathname.split('/').pop();if(!allowed.includes(table))return send(res,404,{message:'Unsupported fixture table'});
  let rows=await serial(async()=>(await db.query(`select * from public.${table}`)).rows);
  for(const [key,filter] of url.searchParams){if(!/^[a-z_]+$/.test(key)||['select','order','limit','offset'].includes(key))continue;const [op,...parts]=filter.split('.');const val=parts.join('.');if(op==='eq')rows=rows.filter(r=>String(r[key])===val);if(op==='gt')rows=rows.filter(r=>Number(r[key])>Number(val));}
  const parties=await serial(async()=>(await db.query('select id,name from parties')).rows);
  rows=rows.map(r=>({...r,customer:parties.find(p=>p.id===r.customer_id),supplier:parties.find(p=>p.id===r.supplier_id)}));
  const limit=Number(url.searchParams.get('limit')??rows.length);rows=rows.slice(Number(url.searchParams.get('offset')??0),limit+Number(url.searchParams.get('offset')??0));
  res.setHeader('Content-Range',`0-${Math.max(0,rows.length-1)}/${rows.length}`);
  return send(res,200,req.headers.accept?.includes('vnd.pgrst.object')?rows[0]??null:rows);
 }
 if(url.pathname==='/__evidence'){const counts=await serial(async()=>(await db.query("select count(*)::int invoices,(select count(*)::int from factory_private.write_receipts) receipts from sales_invoices")).rows[0]);return send(res,200,{synthetic:true,mcpConfigAbsent:true,commandCount,...counts});}
 if(url.pathname==='/app.js'||url.pathname==='/app.css'){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript'});return res.end(readFileSync(join(out,url.pathname.slice(1))));}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(readFileSync(join(out,'index.html')));
 }catch(error){console.log(JSON.stringify({error:error.message}));send(res,400,{message:error.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`READY ${origin}/commercial/treasuries — actual app, synthetic auth, actual native SQL; MCP config absent`));
process.on('SIGINT',()=>{server.close();void db.close().then(()=>process.exit(0));});
