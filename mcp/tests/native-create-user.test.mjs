import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { isNativeAccessToken } from '../../supabase/functions/create-user/native-token.ts';

test('actual create-user handler enforces verified native active-admin boundary before Admin API',async()=>{
 const actor='00000000-0000-4000-8000-000000000001';
 let handler,calls=0,profile={role:'admin',is_active:true},invalid=false,updated=false;
 const api={auth:{getUser:async()=>invalid?{data:{user:null},error:{message:'Denied'}}:{data:{user:{id:actor}},error:null},admin:{createUser:async()=>{calls++;return {data:{user:{id:'synthetic-created-user',email:'local@example.invalid'}},error:null};}}},from:()=>({
  select:()=>({eq:()=>({single:async()=>({data:profile,error:null})})}),
  update:()=>({eq:async()=>{updated=true;return {error:null};}}),
 })};
 const source=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/create-user/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,''));
 new Function('Deno','createClient','isNativeAccessToken',source)({env:{get:()=> 'synthetic-placeholder'},serve:h=>handler=h},()=>api,isNativeAccessToken);
 const base={sub:actor,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
 const request=claims=>new Request('https://local.invalid/create-user',{method:'POST',headers:{Authorization:'Bearer header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature','Content-Type':'application/json'},body:JSON.stringify({email:'local@example.invalid',password:'synthetic-test-only',full_name:'Local fixture',role:'viewer'})});
 invalid=true;assert.equal((await handler(request(base))).status,401);invalid=false;
 assert.equal((await handler(request({...base,client_id:'oauth-client'}))).status,401);
 assert.equal((await handler(request({...base,role:'factory_mcp_resource',aud:'https://factory.example/api/mcp'}))).status,401);
 profile={role:'admin',is_active:false};assert.equal((await handler(request(base))).status,403);
 profile={role:'viewer',is_active:true};assert.equal((await handler(request(base))).status,403);
 assert.equal(calls,0);
 profile={role:'admin',is_active:true};const response=await handler(request(base));
 assert.equal(response.status,200);assert.equal(calls,1);assert.equal(updated,true);
 assert.equal((await response.json()).user.id,'synthetic-created-user');
});
