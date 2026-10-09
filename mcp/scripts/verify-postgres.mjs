import { readFileSync } from 'node:fs';
import { consentAndIssue } from '../tests/oauth-fixture.mjs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { fixtureSql, actor, session, resource } from '../tests/fixture.mjs';

const container = `factory-mcp-test-${randomUUID().slice(0,8)}`;
function docker(args, stdin='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',bytes=>stdout+=bytes);
    child.stderr.on('data',bytes=>stderr+=bytes);
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve(stdout.trim()):reject(new Error(`docker exit ${code}: ${stderr.slice(-2000)}`)));
    child.stdin.end(stdin);
  });
}
const sql=statement=>docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],statement);
const claims=JSON.stringify({sub:actor,role:'authenticated',session_id:session,client_id:'test-client',aud:resource});
let identity=`set local role factory_mcp_gateway; select set_config('request.jwt.claim.sub','${actor}',true); select set_config('request.jwt.claims','${claims}',true);`;
const write=(action,payload,key)=>`select factory_mcp_write('${action}','${JSON.stringify(payload)}'::jsonb,'${key}'::uuid)::text;`;
let created=false;
try {
  await docker(['run','--pull=never','--detach','--name',container,'--network','none','--memory','256m','--cpus','0.5',
    '--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine',
    '-c','shared_buffers=16MB','-c','max_connections=10']);
  created=true;
  let ready=false;
  for(let attempt=0;attempt<30;attempt++) {
    try { await docker(['exec',container,'pg_isready','-U','postgres']); ready=true; break; }
    catch { await new Promise(resolve=>setTimeout(resolve,200)); }
  }
  if(!ready)throw new Error('Local PostgreSQL did not become ready');
  await sql(fixtureSql());
  await sql(readFileSync(new URL('../../supabase/migrations/20261009140827_comprehensive_mcp_operations.sql',import.meta.url),'utf8'));
  const fixtureSession=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let pendingReply;let replyBuffer='';let fixtureError='';
  fixtureSession.stderr.on('data',b=>fixtureError+=b);
  fixtureSession.stdout.on('data',b=>{replyBuffer+=b; if(pendingReply&&replyBuffer.includes(pendingReply.marker+'\n')){const before=replyBuffer.slice(0,replyBuffer.indexOf(pendingReply.marker));replyBuffer=replyBuffer.slice(replyBuffer.indexOf(pendingReply.marker)+pendingReply.marker.length+1);const reply=pendingReply;pendingReply=null;reply.resolve(before.trim());}});
  fixtureSession.on('exit',()=>{pendingReply?.reject(new Error('Synthetic PostgreSQL fixture session failed: '+fixtureError));});
  const sessionSql=statement=>new Promise((resolve,reject)=>{const marker='MCP_TEST_'+randomUUID();pendingReply={marker,resolve,reject};fixtureSession.stdin.write(statement+';\n\\echo '+marker+'\n');});
  const testDb={exec:sessionSql,query:async(statement,values=[])=>{
    const quoted=statement.replace(/\$(\d+)/g,(_,n)=>"'"+String(values[Number(n)-1]).replaceAll("'","''")+"'");
    if(!/^\s*select\b/i.test(quoted)){await sessionSql(quoted);return {rows:[]};}
    const output=await sessionSql("select coalesce(json_agg(row_to_json(t)), '[]'::json) from ("+quoted+") t;");
    return {rows:JSON.parse(output.split('\n').at(-1))};
  }};
  const issued=await consentAndIssue(testDb); fixtureSession.stdin.end();
  await sql(readFileSync(new URL('../../supabase/migrations/20261009161500_readonly_mcp_analytics.sql',import.meta.url),'utf8'));
  const nativeClaims=JSON.stringify({...issued,role:'authenticated'}).replaceAll("'","''");
  identity=`set local role factory_mcp_gateway; select set_config('request.jwt.claim.sub','${actor}',true); select set_config('request.jwt.claims','${nativeClaims}',true);`;
  const analysis=await sql(`begin isolation level repeatable read read only;${identity}select factory_mcp_analyze('{"from":{"table":"raw_materials","alias":"a0"},"select":[{"as":"count","expr":{"kind":"aggregate","fn":"count"}}]}'::jsonb)::text;commit;`);
  assert.ok(analysis.includes('"execution_role": "authenticated"'));
  console.log('PASS PostgreSQL17 all four migrations + OAuth consent/hook + readonly authenticated analytics');
  console.log(await sql('select version();'));
  const key=randomUUID();
  const payload={date:'2026-10-09',notes:'Synthetic concurrency case',items:[{semi_finished_id:1,quantity:10}]};
  const first=sql(`begin;${identity}${write('create_production_order',payload,key)}select pg_sleep(0.3);commit;`);
  const second=sql(`begin;${identity}${write('create_production_order',payload,key)}commit;`);
  const createdResults=await Promise.all([first,second]);
  const records=createdResults.map(output=>JSON.parse(output.split('\n').find(line=>line.startsWith('{"record"'))));
  assert.deepEqual(records[0],records[1]);
  assert.equal(await sql('select count(*) from production_orders;'),'1');
  assert.equal(await sql('select count(*) from production_order_items;'),'1');
  console.log('PASS two sessions, same request: one header, one line, identical receipt');
  const id=records[0].record.id;
  await Promise.all([
    sql(`begin;${identity}${write('complete_production_order',{id},randomUUID())}select pg_sleep(0.3);commit;`),
    sql(`begin;${identity}${write('complete_production_order',{id},randomUUID())}commit;`),
  ]);
  assert.equal(Number(await sql('select quantity from raw_materials where id=1;')),90);
  assert.equal(Number(await sql('select quantity from semi_finished_products where id=1;')),20);
  assert.equal(await sql('select count(*) from inventory_movements;'),'2');
  console.log('PASS two sessions, different completion keys: stock and movements changed once');
  const next=await sql(`begin;${identity}${write('create_production_order',payload,randomUUID())}commit;`);
  const nextId=JSON.parse(next.split('\n').find(line=>line.startsWith('{"record"'))).record.id;
  // The updater publishes a new cost while holding the row lock; completion must wait before reading it.
  const purchase=sql("set application_name='factory-mcp-cost-writer';begin;update raw_materials set quantity=quantity+10,unit_cost=6 where id=1;select pg_sleep(0.8);commit;");
  let writerLocked=false;
  for(let attempt=0;attempt<20;attempt++) {
    writerLocked=await sql("select count(*) from pg_stat_activity where application_name='factory-mcp-cost-writer' and wait_event='PgSleep';")==='1';
    if(writerLocked)break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.ok(writerLocked,'Component updater must hold its lock before completion starts');
  const completion=sql(`begin;${identity}${write('complete_production_order',{id:nextId},randomUUID())}commit;`);
  await Promise.all([purchase,completion]);
  assert.equal(Number(await sql(`select total_cost from production_orders where id=${nextId};`)),60);
  console.log('PASS component cost update versus completion: committed cost snapshot used');
} finally {
  if(created) await docker(['rm','--force',container]);
}
