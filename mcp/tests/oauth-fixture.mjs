import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { actor, session, resource } from './fixture.mjs';
export const oauthClient='00000000-0000-4000-8000-000000000004';
export const oauthSession='00000000-0000-4000-8000-000000000005';
export async function consentAndIssue(db){
 await db.exec(`create role supabase_auth_admin;create role authenticator;grant authenticated,anon to authenticator;
  alter table auth.sessions add oauth_client_id uuid,add scopes text;
  create table auth.oauth_clients(id uuid primary key,registration_type text,redirect_uris text,grant_types text,client_type text,token_endpoint_auth_method text,client_secret_hash text,deleted_at timestamptz);
  create table auth.oauth_authorizations(authorization_id text primary key,user_id uuid,client_id uuid,expires_at timestamptz,status text,resource text,redirect_uri text,response_type text,code_challenge_method text,code_challenge text,scope text);
  create table auth.oauth_consents(user_id uuid,client_id uuid,scopes text,granted_at timestamptz,revoked_at timestamptz);`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009152500_factory_mcp_oauth.sql',import.meta.url),'utf8'));
 // Synthetic preapproved connection policy; never touches hosted Auth or grants.
 await db.query("insert into auth.oauth_clients values($1,'manual','https://chat.example/callback','authorization_code,refresh_token','public','none',null,null)",[oauthClient]);
 await db.query("insert into factory_mcp_auth.static_clients select id,factory_mcp_auth.client_fingerprint(c),$1,'https://chat.example/callback',now()+interval '2 hours',null from auth.oauth_clients c",[resource]);
 await db.query("insert into factory_private.mcp_access values($1,$2,$3,true,now()+interval '1 hour',null)",[actor,oauthClient,resource]);
 await db.query("insert into auth.oauth_authorizations values('sdk-consent',$1,$2,now()+interval '10 minutes','pending',$3,'https://chat.example/callback','code','s256',repeat('A',43),'openid')",[actor,oauthClient,resource]);
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,session_id:session,role:'authenticated',aud:'authenticated'})]);
  const shown=(await db.query("select factory_mcp_consent_request('sdk-consent') value")).rows[0].value;
  assert.equal(shown.user_id,actor);assert.equal(shown.client_id,oauthClient);assert.equal(shown.can_write,true);
  assert.equal((await db.query("select count(*)::int n from factory_mcp_auth.user_admissions")).rows[0].n,0);
  const admitted=(await db.query("select factory_mcp_consent_admit('sdk-consent') value")).rows[0].value;
  assert.deepEqual(admitted,shown);
  await db.exec('commit');
 }catch(error){await db.exec('rollback');throw error;}
 await db.query("insert into auth.sessions(id,user_id,oauth_client_id,scopes) values($1,$2,$3,'openid')",[oauthSession,actor,oauthClient]);
 const claims={sub:actor,session_id:oauthSession,client_id:oauthClient,scope:'openid',aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200};
 const issue=async()=> (await db.query('select factory_mcp_auth.access_token_hook($1::jsonb) value',[JSON.stringify({user_id:actor,claims})])).rows[0].value;
 assert.equal((await issue()).error.http_code,403); // Admission alone grants no provider consent.
 await db.query("insert into auth.oauth_consents values($1,$2,'openid',now(),null)",[actor,oauthClient]);
 await db.exec("update auth.oauth_authorizations set status='approved' where authorization_id='sdk-consent'");
 const issued=await issue();assert.equal(issued.claims.role,'factory_mcp_resource');assert.equal(issued.claims.aud,resource);assert.ok(issued.claims.exp<claims.exp);
 return issued.claims;
}
