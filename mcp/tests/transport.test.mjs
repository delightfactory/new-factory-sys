import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createVerifier } from '../auth.mjs';
import { readResourceConfig } from '../resource.mjs';
import { writes as catalogWrites, reads } from '../catalog.mjs';

const resource='https://factory.example/api/mcp';
const issuer='https://auth.example/auth/v1';
const config={resource,issuer,clientIds:['approved'],appOrigin:'https://factory.example',writesEnabled:true};

test('signed token is bound to resource issuer client and real user claims',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('ES256');
  const jwk=await exportJWK(publicKey); jwk.kid='test-key';
  const verify=createVerifier({...config,jwks:createLocalJWKSet({keys:[jwk]})});
  const claims={sub:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000003',client_id:'approved',role:'factory_mcp_resource',scope:'openid'};
  const sign=payload=>new SignJWT(payload).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  assert.equal((await verify(await sign(claims))).subject,claims.sub);
  for(const replacement of [{client_id:'unapproved'},{aud:'authenticated'},{role:'authenticated'},{role:'service_role'},{session_id:'invalid'},{iss:'https://other.example'}, {exp:1}]){
    const token=await new SignJWT({...claims,iss:issuer,aud:resource,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,...replacement}).setProtectedHeader({alg:'ES256',kid:'test-key'}).sign(privateKey);
    await assert.rejects(verify(token));
  }
});

test('SDK discovers tools and returns real operation structure; HTTP guards deny untrusted requests',async t=>{
  const writes=[];
  const {privateKey,publicKey}=await generateKeyPair('ES256');
  const jwk=await exportJWK(publicKey); jwk.kid='http-key';
  const token=await new SignJWT({sub:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000003',client_id:'approved',role:'factory_mcp_resource',scope:'openid'})
    .setProtectedHeader({alg:'ES256',kid:'http-key'}).setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const app=createApp(config,{
    verify:createVerifier({...config,jwks:createLocalJWKSet({keys:[jwk]})}),
    rpcFactory:()=>async(name,args)=>{
      if(name==='context')return {role:'admin',can_write:true};
      writes.push(args);
      return {request_id:args.requestId,record:{id:42,number:'PR-MCP-test',status:'pending'}};
    },
  });
  const listener=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>listener.once('listening',resolve));
  t.after(()=>{ listener.closeAllConnections(); return new Promise(resolve=>listener.close(resolve)); });
  const url=new URL(`http://127.0.0.1:${listener.address().port}/api/mcp`);
  const denied=await fetch(url);
  assert.equal(denied.status,401);
  assert.ok(denied.headers.get('www-authenticate').includes('/.well-known/oauth-protected-resource/api/mcp'));
  assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${token}`}})).status,405);
  assert.equal((await fetch(url,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://attacker.example'}})).status,403);
  const metadata=await(await fetch(new URL('/api/oauth-resource',url))).json();
  assert.equal(metadata.resource,resource);
  assert.deepEqual(await(await fetch(new URL('/.well-known/oauth-protected-resource/api/mcp',url))).json(),metadata);
  const client=new Client({name:'test',version:'1.0'});
  await client.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  t.after(()=>client.close());
  const {tools}=await client.listTools();
  assert.equal(tools.length,5+Object.keys(catalogWrites).length+Object.keys(reads).length);
  assert.ok(tools.every(tool=>!tool.name.includes('sql')));
  const response=await client.callTool({name:'factory_create_production_order',arguments:{request_id:'00000000-0000-4000-8000-000000000004',date:'2026-10-09',items:[{semi_finished_id:1,quantity:10}]}});
  assert.equal(response.structuredContent.record.id,42);
  assert.equal(writes.length,1);
  const invalid=await client.callTool({name:'factory_create_production_order',arguments:{request_id:'00000000-0000-4000-8000-000000000004',date:'2026-10-09',items:[{semi_finished_id:1,quantity:10}],status:'completed'}});
  assert.equal(invalid.isError,true);
  assert.equal(writes.length,1);
});

test('configured staged deployment refuses writes before dispatch and permits reads with the same consent',async t=>{
 const staged=readResourceConfig({FACTORY_MCP_RESOURCE:resource,FACTORY_MCP_ISSUER:issuer,FACTORY_APP_ORIGIN:'https://factory.example',FACTORY_MCP_CLIENT_IDS:'approved'});
 delete staged.writesEnabled; // Constructor also fails closed, independently of env parsing.
 assert.equal(readResourceConfig({FACTORY_MCP_RESOURCE:resource,FACTORY_MCP_ISSUER:issuer,FACTORY_APP_ORIGIN:'https://factory.example'}).writesEnabled,false);
 assert.equal(readResourceConfig({FACTORY_MCP_RESOURCE:resource,FACTORY_MCP_ISSUER:issuer,FACTORY_APP_ORIGIN:'https://factory.example',FACTORY_MCP_WRITES_ENABLED:'true'}).writesEnabled,true);
 let dispatchedWrites=0;
 const listener=createApp(staged,{verify:async()=>({subject:'test'}),rpcFactory:()=>async name=>{
  if(name==='write')dispatchedWrites++;
  return {role:'admin',can_write:true};
 }}).listen(0,'127.0.0.1');
 await new Promise(resolve=>listener.once('listening',resolve));
 t.after(()=>{listener.closeAllConnections();return new Promise(resolve=>listener.close(resolve));});
 const client=new Client({name:'staged-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${listener.address().port}/api/mcp`),{requestInit:{headers:{Authorization:'Bearer synthetic'}}}));
 t.after(()=>client.close());
 assert.equal((await client.callTool({name:'factory_context',arguments:{}})).structuredContent.can_write,true);
 const response=await client.callTool({name:'factory_create_production_order',arguments:{request_id:'00000000-0000-4000-8000-000000000004',date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]}});
 assert.equal(response.isError,true);assert.equal(response.content[0].text,'MCP_WRITES_NOT_ENABLED');assert.equal(dispatchedWrites,0);
});
