import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { fixtureSql, actor, session, resource } from './fixture.mjs';
const client='00000000-0000-4000-8000-000000000004';
let db;
before(async()=>{
 db=new PGlite();await db.exec(fixtureSql());
 await db.exec(`create role supabase_auth_admin; create role authenticator;
  grant authenticated,anon to authenticator;
  alter table auth.sessions add oauth_client_id uuid,add scopes text;
  create table auth.oauth_clients(id uuid primary key,registration_type text,redirect_uris text,grant_types text,
   client_type text,token_endpoint_auth_method text,client_secret_hash text,deleted_at timestamptz);
  create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,
   expires_at timestamptz,status text,resource text,redirect_uri text,response_type text,
   code_challenge_method text,code_challenge text,scope text);
  create table auth.oauth_consents(user_id uuid,client_id uuid,scopes text,granted_at timestamptz,revoked_at timestamptz);
 `);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009152500_factory_mcp_oauth.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
function claims(extra={}){return {sub:actor,session_id:session,role:'authenticated',aud:'authenticated',iat:1,exp:4102444800,...extra};}
async function hook(c){return (await db.query('select factory_mcp_auth.access_token_hook($1::jsonb) value',[JSON.stringify({user_id:actor,claims:c})])).rows[0].value;}
async function approved(){
 await db.query(`insert into auth.oauth_clients values($1,'manual','https://chat.example/callback','authorization_code,refresh_token','public','none',null,null)`,[client]);
 await db.query(`insert into factory_mcp_auth.static_clients select id,factory_mcp_auth.client_fingerprint(c),$1,'https://chat.example/callback',now()+interval '2 hours',null from auth.oauth_clients c`,[resource]);
 await db.query(`insert into factory_private.mcp_access values($1,$2,$3,true,now()+interval '1 hour',null)`,[actor,client,resource]);
 await db.query(`update auth.sessions set oauth_client_id=$1,scopes='openid' where id=$2`,[client,session]);
 await db.query(`insert into auth.oauth_consents values($1,$2,'openid',now(),null)`,[actor,client]);
 await db.query(`insert into factory_mcp_auth.user_admissions select $1,client_id,resource,'test-authorization',$2,fingerprint,'openid',expires_at,now() from factory_mcp_auth.static_clients`,[actor,session]);
}
test('OAuth hook preserves native claims and fails closed with empty policies',()=>isolated(async()=>{
 const native=claims();assert.deepEqual(await hook(native),{claims:native});
 assert.equal((await hook(claims({client_id:client,scope:'openid'}))).error.http_code,403);
 assert.equal((await db.query('select count(*)::int n from factory_mcp_auth.static_clients')).rows[0].n,0);
}));
test('approved OAuth emits isolated audience/role/expiry and live commands reject revoked consent',()=>isolated(async()=>{
 await approved(); const input=claims({client_id:client,scope:'openid'});const output=await hook(input);
 assert.equal(output.claims.aud,resource);assert.equal(output.claims.role,'factory_mcp_resource');
 assert.ok(output.claims.exp<input.exp);assert.equal(output.claims.sub,actor);
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({...input,aud:resource})]);
 assert.equal((await db.query('select factory_mcp_context() value')).rows[0].value.user_id,actor);
 await db.query('update auth.oauth_consents set revoked_at=now() where client_id=$1',[client]);
 assert.equal((await hook(input)).error.http_code,403);
 await db.exec('savepoint revoked');await assert.rejects(db.query('select factory_mcp_context()'),/MCP_ACCESS_FORBIDDEN/);await db.exec('rollback to revoked');
}));
test('changed callback and unapproved scope deny issuance; resource role has no authenticator membership',()=>isolated(async()=>{
 await approved();await db.query("update auth.oauth_clients set redirect_uris='https://evil.example/callback' where id=$1",[client]);
 assert.equal((await hook(claims({client_id:client,scope:'openid'}))).error.http_code,403);
 assert.equal((await hook(claims({client_id:client,scope:'openid admin'}))).error.http_code,403);
 assert.equal((await db.query("select pg_has_role('authenticator','factory_mcp_resource','MEMBER') value")).rows[0].value,false);
 await db.exec('savepoint direct;set local role factory_mcp_resource');
 await assert.rejects(db.query('select * from public.sales_invoices'),/permission denied/);await db.exec('rollback to direct');
 await db.exec('savepoint impersonation;set session authorization authenticator');
 await assert.rejects(db.exec('set local role factory_mcp_resource'),/permission denied/);await db.exec('rollback to impersonation');
}));
