import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fixtureSql,actor,customer} from './fixture.mjs';
import {consentAndIssue} from './oauth-fixture.mjs';
import {cases} from './analytics-cases.mjs';
import {createDatabaseRpc} from '../auth.mjs';
import {analyticalQuery} from '../analytics.mjs';
const migration=new URL('../../supabase/migrations/20261009161500_readonly_mcp_analytics.sql',import.meta.url);
test('structured analytical reads use bounded full-input aggregation and native RLS',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fixtureSql());
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009140827_comprehensive_mcp_operations.sql',import.meta.url),'utf8'));
 const claims=await consentAndIssue(db);await db.exec(readFileSync(migration,'utf8'));
 const principal={subject:claims.sub,sessionId:claims.session_id,clientId:claims.client_id,scope:claims.scope,resource:claims.aud};
 const rpc=createDatabaseRpc({principal,pool:{connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}})}});
 async function run(query,name='analyze'){await db.exec('set role factory_mcp_gateway');try{return await rpc(name,{payload:query});}finally{await db.exec('reset role');}}
 for(const c of cases) await t.test(c.name,async()=>{
   for(const sql of c.setupSql??[])await db.exec(sql);
   if(c.error)await assert.rejects(run(c.query),new RegExp(c.error));
   else {const result=await run(c.query);for(const [key,value]of Object.entries(c.expected))assert.deepEqual(result[key],value);assert.equal(result.execution_role,'authenticated');}
 });
 await t.test('schema reflects role; raw CTE, multistatement and function syntax rejected',async()=>{
  const schema=await run({},'schema');assert.ok(schema.tables.raw_materials);assert.equal(schema.tables.profiles,undefined);
  for(const sql of ['WITH x AS (DELETE FROM raw_materials RETURNING *) SELECT * FROM x','SELECT 1; UPDATE parties SET balance=0','SELECT public.factory_write()']) {
   assert.equal(analyticalQuery.safeParse(sql).success,false);
   await assert.rejects(run(sql),/MCP_ANALYTICS_INPUT_INVALID/);
  }
  await db.query("update profiles set role='inventory_officer' where id=$1",[actor]);
  const limited=await run({},'schema');assert.equal(limited.tables.parties,undefined);
  await assert.rejects(run({from:{table:'parties',alias:'a0'},select:[{as:'id',expr:{kind:'column',field:{alias:'a0',column:'id'}}}]}),/MCP_ANALYTICS_TABLE_FORBIDDEN/);
  await db.query("update profiles set role='admin' where id=$1",[actor]);
 });
 await t.test('source RLS restrictive policy denies even administrator-profile rows',async()=>{
  await db.exec(`alter table parties enable row level security; create policy analytics_restricted on parties as restrictive for select to authenticated using(id=auth.uid());`);
  const result=await run({from:{table:'parties',alias:'a0'},select:[{as:'id',expr:{kind:'column',field:{alias:'a0',column:'id'}}}]});
  assert.deepEqual(result.rows,[]);assert.equal(result.total_count,0);
  await db.exec('drop policy analytics_restricted on parties');
 });
 await t.test('read-write transaction and non-gateway invocation refused',async()=>{
  await db.exec('set role factory_mcp_gateway');
  await assert.rejects(db.query("select public.factory_mcp_analyze($1::jsonb)",[JSON.stringify(cases[0].query)]),/MCP_ANALYTICS_EXECUTOR_INVALID/);
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query('select public.factory_mcp_schema($1::jsonb)',['{}']),/permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query("select pg_get_userbyid(proowner) owner from pg_proc where proname='factory_mcp_analyze'")).rows[0].owner,'authenticated');
 });
});
