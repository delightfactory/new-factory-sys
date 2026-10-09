import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { mcpAccessIsCurrent, mcpAccessExpiryLabel } from '../../src/lib/mcp-access-expiry.ts';
import { isNativeAccessToken } from '../../supabase/functions/create-user/native-token.ts';
import { fixtureSql, actor, session, resource } from './fixture.mjs';
import { consentAndIssue, oauthClient, oauthSession } from './oauth-fixture.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../../docs/MCP-NATIVE-ROLLBACK-SNAPSHOT.json',import.meta.url),'utf8'));
const target='00000000-0000-4000-8000-000000000099';
const native={sub:actor,session_id:session,role:'authenticated',aud:'authenticated',iat:1,exp:4102444800};
let db;
before(async()=>{
 db=new PGlite();
 const baseline=snapshot.functions.map(f=>f.definition+';').join('\n');
 await db.exec(fixtureSql().replace('-- Review-only foundation.',baseline+'\n-- Review-only foundation.'));
 await db.exec("create role service_role bypassrls; grant usage on schema public,auth to service_role; grant all on all tables in schema public,auth to service_role;");
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009140827_comprehensive_mcp_operations.sql',import.meta.url),'utf8'));
 await consentAndIssue(db);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009161500_readonly_mcp_analytics.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function isolated(fn){await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}}
async function identify(id=actor,c={...native,sub:id}){
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify(c)]);
}
async function denied(sql,pattern){await db.exec('savepoint denial');await assert.rejects(db.exec(sql),pattern);await db.exec('rollback to denial');}
async function hook(c){return (await db.query('select factory_mcp_auth.access_token_hook($1::jsonb) value',[JSON.stringify({user_id:actor,claims:c})])).rows[0].value;}

test('native profile read/name remains; direct role/activity escalation fails',()=>isolated(async()=>{
 await identify();await db.exec('set local role authenticated');
 assert.equal((await db.query('select role from profiles where id=$1',[actor])).rows[0].role,'admin');
 await db.query('update profiles set full_name=$1 where id=$2',['Renamed',actor]);
 await denied(`update profiles set role='viewer' where id='${actor}'`,/permission denied/);
 await denied(`update profiles set is_active=false where id='${actor}'`,/permission denied/);
}));

test('live native admin RPC definitions retain name/role/activity/delete after profile ACL hardening',()=>isolated(async()=>{
 await db.query('insert into auth.users(id) values($1)',[target]);
 await identify();await db.exec('set local role authenticated');
 await db.query('select update_user_details_by_admin($1,$2)',[target,'Test operator']);
 await db.query('select update_user_role($1,$2::app_role)',[target,'accountant']);
 await db.query('select toggle_user_active($1,false)',[target]);
 const profile=(await db.query('select full_name,role,is_active from profiles where id=$1',[target])).rows[0];
 assert.deepEqual(profile,{full_name:'Test operator',role:'accountant',is_active:false});
 await db.exec('reset role');
 assert.equal((await db.query('select raw_user_meta_data from auth.users where id=$1',[target])).rows[0].raw_user_meta_data.full_name,'Test operator');
 await db.exec('set local role authenticated');
 await db.query('select delete_user_by_admin($1)',[target]);
 assert.equal((await db.query('select count(*)::int n from profiles where id=$1',[target])).rows[0].n,0);
 await denied(`select delete_user_by_admin('${actor}')`,/own account/);
}));

test('viewer cannot execute admin writes; existing server role can finalize a newly created profile',()=>isolated(async()=>{
 await db.query('insert into auth.users(id) values($1)',[target]);await identify(target);await db.exec('set local role authenticated');
 for(const statement of [`select update_user_role('${actor}','viewer')`,`select toggle_user_active('${actor}',false)`,`select update_user_details_by_admin('${actor}','x')`,`select delete_user_by_admin('${actor}')`])await denied(statement,/Access Denied/);
 assert.equal((await db.query("select has_function_privilege('authenticated','reset_user_password_by_admin(uuid,text)','EXECUTE') ok")).rows[0].ok,true);
 await db.exec('reset role;set local role service_role');
 await db.query("update profiles set role='accountant',full_name='Created by native server' where id=$1",[target]);
 await db.exec('reset role');assert.equal((await db.query('select role from profiles where id=$1',[target])).rows[0].role,'accountant');
}));

test('native initial/refreshed claims are byte-equivalent; expired native session rejects commands',()=>isolated(async()=>{
 assert.deepEqual(await hook(native),{claims:native});
 const renewed={...native,iat:2,exp:4102444900};assert.deepEqual(await hook(renewed),{claims:renewed});
 await identify();await db.exec('set local role authenticated');
 await db.exec("select factory_write('create_production_order','{\"date\":\"2026-10-09\",\"items\":[{\"semi_finished_id\":1,\"quantity\":1}]}','00000000-0000-4000-8000-000000000111')");
 await db.exec('reset role');await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[session]);
 await db.exec('set local role authenticated');await denied("select factory_write('create_production_order','{}','00000000-0000-4000-8000-000000000112')",/MCP_ACCESS_FORBIDDEN/);
}));

test('persistent policy supports finite token renewal/read-to-write/revocation without reconnect',()=>isolated(async()=>{
 await db.exec("update factory_mcp_auth.static_clients set expires_at='infinity';update factory_private.mcp_access set expires_at='infinity',can_write=false;update factory_mcp_auth.user_admissions set expires_at='infinity';");
 await db.exec("update auth.sessions set scopes='openid offline_access' where oauth_client_id is not null;update auth.oauth_consents set scopes='openid offline_access';update factory_mcp_auth.user_admissions set scope='openid offline_access';");
 const c={...native,session_id:oauthSession,client_id:oauthClient,scope:'openid offline_access',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
 assert.equal((await hook(c)).claims.exp,c.exp);
 const renewed={...c,iat:c.iat+100,exp:c.exp+100};assert.equal((await hook(renewed)).claims.exp,renewed.exp);
 await identify(actor,{...c,aud:resource});
 await denied("select factory_mcp_write('create_production_order','{}','00000000-0000-4000-8000-000000000113')",/MCP_WRITE_FORBIDDEN/);
 await db.exec('update factory_private.mcp_access set can_write=true');
 const order=(await db.query("select factory_mcp_write('create_production_order','{\"date\":\"2026-10-09\",\"items\":[{\"semi_finished_id\":1,\"quantity\":1}]}','00000000-0000-4000-8000-000000000113') value")).rows[0].value;
 assert.ok(order.record.code);
 await db.exec('update factory_private.mcp_access set revoked_at=now()');
 assert.equal((await hook(renewed)).error.http_code,403);await denied('select factory_mcp_context()',/MCP_ACCESS_FORBIDDEN/);
}));

test('native SQL rollback restores live function definitions and profile UPDATE ACL without deleting evidence',()=>isolated(async()=>{
 await identify();
 await db.exec("select factory_write('create_production_order','{\"date\":\"2026-10-09\",\"items\":[{\"semi_finished_id\":1,\"quantity\":1}]}','00000000-0000-4000-8000-000000000114')");
 await db.exec(readFileSync(new URL('../../docs/MCP-NATIVE-ROLLBACK.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
 for(const f of snapshot.functions.filter(f=>/^(complete_|process_sales)/.test(f.identity))){
  const actual=(await db.query('select pg_get_functiondef($1::regprocedure) value',[f.identity])).rows[0].value;
  const normalize=sql=>sql.replaceAll('\r','').replace(/[ \t]+(?=\n)/g,'');
  assert.equal(normalize(actual),normalize(f.definition));
 }
 assert.equal((await db.query("select has_table_privilege('authenticated','profiles','UPDATE') ok")).rows[0].ok,true);
 assert.equal((await db.query("select has_column_privilege('authenticated','profiles','full_name','UPDATE') ok")).rows[0].ok,true);
 assert.equal((await db.query('select count(*)::int n from factory_private.write_receipts')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from production_orders')).rows[0].n,1);
 assert.ok((await db.query("select to_regclass('factory_private.write_receipts') name")).rows[0].name);
 assert.equal((await db.query("select has_function_privilege('factory_mcp_gateway','factory_mcp_context()','EXECUTE') ok")).rows[0].ok,false);
}));

test('consent displays revocable permanent access and refuses malformed/expired dates',async()=>{
 const m={mcpAccessIsCurrent,mcpAccessExpiryLabel};
 assert.equal(m.mcpAccessIsCurrent('infinity'),true);assert.match(m.mcpAccessExpiryLabel('infinity'),/إلغاء الوصول/);
 assert.equal(m.mcpAccessIsCurrent('garbage'),false);assert.equal(m.mcpAccessIsCurrent('-infinity'),false);
 assert.equal(m.mcpAccessIsCurrent('2026-10-09T00:00:00Z',Date.parse('2026-10-09T00:00:00Z')),false);
});

test('native user deletion keeps audit receipts; native session/client cleanup cannot be blocked by MCP FKs',()=>isolated(async()=>{
 const targetSession='00000000-0000-4000-8000-000000000098';
 await db.query('insert into auth.users(id) values($1)',[target]);
 await db.query("update profiles set role='production_officer' where id=$1",[target]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[targetSession,target]);
 await identify(target,{...native,sub:target,session_id:targetSession});
 await db.exec("select factory_write('create_production_order','{\"date\":\"2026-10-09\",\"items\":[{\"semi_finished_id\":1,\"quantity\":1}]}','00000000-0000-4000-8000-000000000115')");
 await db.query('insert into factory_mcp_auth.user_admissions select $1,client_id,resource,authorization_id,$2,fingerprint,scope,expires_at,admitted_at from factory_mcp_auth.user_admissions where user_id=$3',[target,targetSession,actor]);
 await db.query('delete from auth.sessions where id=$1',[targetSession]);
 await identify();await db.exec('set local role authenticated');await db.query('select delete_user_by_admin($1)',[target]);await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from factory_private.write_receipts where user_id=$1',[target])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from factory_mcp_auth.user_admissions where user_id=$1',[target])).rows[0].n,0);
 await db.query('delete from auth.sessions where id=$1',[session]);
 assert.equal((await db.query('select count(*)::int n from factory_mcp_auth.user_admissions where user_id=$1',[actor])).rows[0].n,1);
 await db.query('delete from auth.oauth_clients where id=$1',[oauthClient]);
 assert.equal((await db.query('select count(*)::int n from factory_mcp_auth.static_clients')).rows[0].n,0);
}));

test('create-user accepts only a previously verified unexpired native identity, never MCP OAuth tokens',()=>{
 const now=Date.now();
 const claims={sub:actor,role:'authenticated',aud:'authenticated',exp:Math.floor(now/1000)+3600};
 const token=c=>'header.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.signature';
 assert.equal(isNativeAccessToken(token(claims),actor,now),true);
 for(const changes of [{client_id:oauthClient},{aud:resource},{role:'factory_mcp_resource'},{role:'service_role'},{exp:1},{exp:'9999999999'},{sub:target}])
  assert.equal(isNativeAccessToken(token({...claims,...changes}),actor,now),false);
 assert.equal(isNativeAccessToken('invalid',actor,now),false);
});
