import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writes, reads } from '../catalog.mjs';
import { createHash } from 'node:crypto';

// The actual @vercel/node builder from an installed CLI; no project linking or account access.
const cliModules=process.env.VERCEL_BUILDER_MODULES;
if(!cliModules)throw new Error('Set VERCEL_BUILDER_MODULES to the installed vercel/node_modules directory');
const require=createRequire(import.meta.url);
const builder=require(join(cliModules,'@vercel/node'));
const buildUtils=require(join(cliModules,'@vercel/build-utils'));
const workPath=resolve(new URL('../../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const outputRoot=resolve(process.argv[2] || join(workPath,'..','vercel-mcp-artifacts'));
const sourceFiles=Object.assign({},await buildUtils.glob('api/{mcp,oauth-resource}.js',workPath),
  await buildUtils.glob('mcp/*.mjs',workPath),await buildUtils.glob('mcp/certs/*.crt',workPath),
  await buildUtils.glob('package.json',workPath));
const functionConfig=JSON.parse(readFileSync(join(workPath,'vercel.json'),'utf8')).functions;
for(const entrypoint of ['api/mcp.js','api/oauth-resource.js']) {
  const built=await builder.build({files:sourceFiles,entrypoint,workPath,
    config:{zeroConfig:true,...functionConfig?.[entrypoint],projectSettings:{installCommand:'',buildCommand:'node -e "process.exit(0)"',nodeVersion:'24.x'}},
    considerBuildCommand:true,meta:{skipDownload:true}});
  const lambda=built.output;
  assert.ok(lambda.files && lambda.handler,'Vercel builder must return a real function artifact');
  const names=Object.keys(lambda.files);
  assert.ok(!names.some(name=>/(?:^|\/)\.env(?:$|\.)/.test(name)), 'No environment file may enter the artifact');
  const destination=join(outputRoot,entrypoint.replace(/\.js$/,'.func'));
  let byteCount=0;
  for(const [name,file] of Object.entries(lambda.files)) {
    const target=resolve(destination,name);
    assert.ok(target.startsWith(resolve(destination)+require('node:path').sep));
    mkdirSync(require('node:path').dirname(target),{recursive:true});
    const bytes=file.fsPath ? readFileSync(file.fsPath)
      : file.data !== undefined ? Buffer.from(file.data)
      : await buffer(await file.toStream());
    writeFileSync(target,bytes); byteCount+=bytes.length;
  }
  const manifest={builderVersion:require(join(cliModules,'@vercel/node/package.json')).version,
    entrypoint,handler:lambda.handler,runtime:lambda.runtime,files:names.length,bytes:byteCount};
  writeFileSync(join(destination,'.vc-config.json'),JSON.stringify({runtime:lambda.runtime,handler:lambda.handler,launcherType:'Nodejs'},null,2));
  writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest));
}

// Boot the emitted handlers, with the same response helpers supplied by Vercel.
const load=(functionName,file)=>import(pathToFileURL(join(outputRoot,'api',`${functionName}.func`,file)).href);
const metadataHandler=(await load('oauth-resource','api/oauth-resource.js')).default;
const mcpHandler=(await load('mcp','api/mcp.js')).default;
const {readConfig}=await load('mcp','mcp/runtime.mjs');
const {database:packagedDatabase}=readConfig({
  FACTORY_MCP_RESOURCE:'https://factory.example/api/mcp',FACTORY_MCP_ISSUER:'https://auth.example/auth/v1',
  FACTORY_APP_ORIGIN:'https://factory.example',FACTORY_MCP_CLIENT_IDS:'test-client',
  FACTORY_MCP_DATABASE_HOST:'aws-1-eu-west-2.pooler.supabase.com',
  FACTORY_MCP_DATABASE_USER:'factory_mcp_gateway.cgqunqczuvwfvuzlsvyy',
  FACTORY_MCP_DATABASE_URL:'postgresql://factory_mcp_gateway.cgqunqczuvwfvuzlsvyy:synthetic@aws-1-eu-west-2.pooler.supabase.com:6543/postgres',
});
assert.equal(packagedDatabase.ssl.rejectUnauthorized,true);
assert.equal(createHash('sha256').update(packagedDatabase.ssl.ca).digest('hex'),
  '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
console.log('PASS emitted MCP runtime loads bundled public CA with verified TLS; no database connection made');
const publicConfig={resource:'https://factory.example/api/mcp',issuer:'https://auth.example/auth/v1',
  appOrigin:'https://factory.example',clientIds:['test-client']};
const listener=createServer((req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
  return (req.url==='/api/mcp'?mcpHandler:metadataHandler)(req,res);
});
await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${listener.address().port}`;
try {
  assert.equal((await fetch(`${base}/api/mcp`)).status,503);
  process.env.FACTORY_MCP_RESOURCE=publicConfig.resource;
  process.env.FACTORY_MCP_ISSUER=publicConfig.issuer;
  process.env.FACTORY_APP_ORIGIN=publicConfig.appOrigin;
  const response=await fetch(`${base}/api/oauth-resource`);
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).resource,publicConfig.resource);
  assert.equal((await fetch(`${base}/api/oauth-resource`,{method:'POST'})).status,405);
  console.log('PASS emitted Vercel handlers: public discovery 200 without database/client secrets, POST 405, unconfigured MCP 503');
} finally { listener.closeAllConnections(); await new Promise(resolve=>listener.close(resolve)); }

// Exercise the traced server/identity code; only the database boundary is substituted.
const {createApp}=await load('mcp','mcp/server.mjs');
const {createVerifier}=await load('mcp','mcp/auth.mjs');
const {privateKey,publicKey}=await generateKeyPair('ES256');
const jwk=await exportJWK(publicKey); jwk.kid='packaged-test';
const token=await new SignJWT({sub:'00000000-0000-4000-8000-000000000001',
  session_id:'00000000-0000-4000-8000-000000000003',client_id:'test-client',role:'factory_mcp_resource',scope:'openid'})
  .setProtectedHeader({alg:'ES256',kid:jwk.kid}).setIssuer(publicConfig.issuer).setAudience(publicConfig.resource)
  .setIssuedAt().setExpirationTime('5m').sign(privateKey);
const app=createApp({...publicConfig,writesEnabled:true},{verify:createVerifier({...publicConfig,jwks:createLocalJWKSet({keys:[jwk]})}),
  rpcFactory:()=>async name=>name==='context'?{role:'admin',can_write:true}:
    {record:{id:42,number:'PR-MCP-test',status:'pending'}}});
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const url=new URL(`http://127.0.0.1:${server.address().port}/api/mcp`);
const client=new Client({name:'packaged-smoke',version:'1.0'});
try {
  const denied=await fetch(url); assert.equal(denied.status,401);
  assert.ok(denied.headers.get('www-authenticate').includes('/.well-known/oauth-protected-resource/api/mcp'));
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  assert.equal((await client.listTools()).tools.length,5+Object.keys(writes).length+Object.keys(reads).length);
  const response=await client.callTool({name:'factory_create_production_order',arguments:{
    request_id:'00000000-0000-4000-8000-000000000004',date:'2026-10-09',items:[{semi_finished_id:1,quantity:10}]}});
  assert.equal(response.structuredContent.record.id,42);
  console.log('PASS emitted MCP trace: signed identity, SDK initialize/tools/list/call, integrated catalog, operation number, 401 challenge');
} finally { await client.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
