import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const repository = new URL('../../', import.meta.url);
const actor = '00000000-0000-4000-8000-000000000001';
const customer = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
const resource = 'https://factory.example/api/mcp';
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.role() returns text language sql as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;`);
  await db.exec(readFileSync(new URL('supabase/full_schema.sql',repository),'utf8'));
  for (const migration of [
    '20240105000000_recipe_batch_size.sql','20240114000000_commercial_schema.sql',
    '20240114000002_invoices_schema.sql','20240114000004_fix_missing_columns.sql',
    '20240114000007_financial_returns.sql',
    '20240114000009_clean_financial_functions.sql',
    '20240114000010_financial_pnl.sql',
    '20240120000000_user_management.sql','20240124000000_audit_system.sql',
    '20240126000000_comprehensive_inventory_tracking.sql','20260130000000_product_bundles.sql',
    '20261009130620_remote_mcp_foundation.sql',
  ]) {
    if (migration === '20261009130620_remote_mcp_foundation.sql') {
      // Supabase public Data API baseline; the new migration then restricts profiles.
      await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated;');
    }
    try { await db.exec(readFileSync(new URL(`supabase/migrations/${migration}`,repository),'utf8')); }
    catch (error) { throw new Error(`${migration}: ${error.message}`); }
  }
  await db.query('insert into auth.users(id)values($1)',[actor]);
  await db.query("update profiles set role='admin' where id=$1",[actor]);
  await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,actor]);
  await db.query(`insert into factory_private.mcp_access(user_id,client_id,resource,can_write,expires_at)
    values($1,'test-client',$2,true,now()+interval '1 day')`,[actor,resource]);
  await db.query("insert into parties(id,name,type)values($1,'Test customer','customer')",[customer]);
  await db.exec(`insert into raw_materials(code,name,unit,quantity,unit_cost)values('RM1','Raw','kg',100,2);
    insert into packaging_materials(code,name,unit,quantity,unit_cost)values('PM1','Bottle','unit',100,1);
    insert into semi_finished_products(code,name,unit,quantity,unit_cost,recipe_batch_size)values('SF1','Mix','kg',10,4,10);
    insert into semi_finished_ingredients(semi_finished_id,raw_material_id,percentage,quantity)values(1,1,100,10);
    insert into finished_products(code,name,unit,quantity,unit_cost,semi_finished_id,semi_finished_quantity)
      values('FP1','Finished','unit',10,5,1,2);
    insert into finished_product_packaging(finished_product_id,packaging_material_id,quantity)values(1,1,1);`);
});
after(async () => { await db?.close(); });

async function isolated(fn) {
  await db.exec('begin');
  try { await identity(); await fn(); } finally { await db.exec('rollback'); }
}
async function identity(role = 'factory_mcp_gateway', claims = {}) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [actor,JSON.stringify({sub:actor,role:'authenticated',session_id:session,client_id:'test-client',aud:resource,...claims})]);
  await db.exec(`set local role ${role}`);
}
async function owner(sql,values=[]) { await db.exec('reset role'); return db.query(sql,values); }
async function write(action,payload,key=randomUUID()) {
  const response=await db.query('select factory_mcp_write($1,$2::jsonb,$3::uuid) result',[action,JSON.stringify(payload),key]);
  return response.rows[0].result;
}
async function scalar(sql) { return (await owner(sql)).rows[0].value; }
const order = {date:'2026-10-09',items:[{semi_finished_id:1,quantity:10}]};
const invoice = {date:'2026-10-09',customer_id:customer,items:[{finished_product_id:1,quantity:2,unit_price:20}],tax_amount:3,shipping_cost:2,discount_amount:1};

test('retry preserves number and creates one invoice with server totals', () => isolated(async () => {
  const key=randomUUID();
  const first=await write('create_sales_invoice',invoice,key);
  assert.deepEqual(await write('create_sales_invoice',invoice,key),first);
  assert.equal(first.record.status,'draft');
  assert.equal(first.record.total_amount,44);
  assert.equal(await scalar('select count(*)::int value from sales_invoices'),1);
  assert.equal(await scalar('select count(*)::int value from sales_invoice_items'),1);
  assert.equal(await scalar('select quantity::float value from finished_products where id=1'),10);
}));

test('same key with changed intent is rejected before a second write', () => isolated(async () => {
  const key=randomUUID(); await write('create_production_order',order,key);
  await assert.rejects(write('create_production_order',{...order,notes:'different'},key),/MCP_REQUEST_CONFLICT/);
}));

test('invalid later line rolls back header lines audit and receipt', () => isolated(async () => {
  await db.exec('savepoint invalid_line');
  await assert.rejects(write('create_sales_invoice',{...invoice,items:[...invoice.items,{finished_product_id:999,quantity:1,unit_price:1}]}),/MCP_PRODUCT_INVALID/);
  await db.exec('rollback to savepoint invalid_line');
  assert.equal(await scalar('select count(*)::int value from sales_invoices'),0);
  assert.equal(await scalar('select count(*)::int value from factory_private.write_receipts'),0);
  assert.equal(await scalar("select count(*)::int value from audit_logs where table_name='sales_invoices'"),0);
}));

test('completion with new keys and direct UI retry moves stock once and retains WACO', () => isolated(async () => {
  const created=await write('create_production_order',order);
  assert.equal(created.record.total_cost,20);
  await write('complete_production_order',{id:created.record.id});
  await write('complete_production_order',{id:created.record.id});
  await identity('authenticated',{client_id:undefined});
  await db.query('select complete_production_order_atomic($1)',[created.record.id]);
  assert.equal(await scalar('select quantity::float value from raw_materials where id=1'),90);
  assert.equal(await scalar('select quantity::float value from semi_finished_products where id=1'),20);
  assert.equal(await scalar('select unit_cost::float value from semi_finished_products where id=1'),3);
  assert.equal(await scalar('select total_cost::float value from production_orders'),20);
  assert.equal(await scalar('select count(*)::int value from inventory_movements'),2);
}));

test('packaging completion preserves component costs and is repeat-safe', () => isolated(async () => {
  const created=await write('create_packaging_order',{date:'2026-10-09',items:[{finished_product_id:1,quantity:2}]});
  assert.equal(created.record.total_cost,18);
  await write('complete_packaging_order',{id:created.record.id});
  await write('complete_packaging_order',{id:created.record.id});
  assert.equal(await scalar('select quantity::float value from semi_finished_products where id=1'),6);
  assert.equal(await scalar('select quantity::float value from packaging_materials where id=1'),98);
  assert.equal(await scalar('select total_cost::float value from packaging_orders'),18);
  assert.equal(await scalar('select unit_cost::float value from finished_products where id=1'),68/12);
  assert.equal(await scalar('select count(*)::int value from inventory_movements'),3);
}));

test('posting invoice preserves COGS and party balance exactly once', () => isolated(async () => {
  const created=await write('create_sales_invoice',invoice);
  await write('post_sales_invoice',{id:created.record.id});
  await write('post_sales_invoice',{id:created.record.id});
  assert.equal(await scalar('select quantity::float value from finished_products where id=1'),8);
  assert.equal(await scalar('select unit_cost_at_sale::float value from sales_invoice_items'),5);
  assert.equal(await scalar('select balance::float value from parties'),44);
  assert.equal(await scalar('select count(*)::int value from inventory_movements'),1);
}));

test('inactive user revoked grant expired session read-only grant and wrong resource are denied', async () => {
  for(const change of [
    "update profiles set is_active=false",
    "update factory_private.mcp_access set revoked_at=now()",
    "update factory_private.mcp_access set expires_at=now()-interval '1 second'",
    "update auth.sessions set not_after=now()-interval '1 second'",
    "update factory_private.mcp_access set can_write=false",
    "update factory_private.mcp_access set resource='https://other.example/api/mcp'",
    "update profiles set role='viewer'",
  ]) await isolated(async()=>{
    await owner(change); await identity();
    await assert.rejects(write('create_production_order',order),/MCP_(?:ACCESS|WRITE)_FORBIDDEN/);
  });
});

test('gateway has no table access and user cannot elevate own role', () => isolated(async () => {
  await assert.rejects(db.query('select * from factory_private.mcp_access'),/permission denied/);
  await db.exec('rollback; begin'); await identity('authenticated',{client_id:undefined});
  await assert.rejects(db.query("update profiles set role='admin' where id=$1",[actor]),/permission denied/);
}));

test('cancelled and nonexistent orders cannot be completed', async () => {
  for(const status of ['cancelled','missing']) await isolated(async()=>{
    const created=await write('create_production_order',order);
    await owner(status==='missing'?'delete from production_orders where id=$1':"update production_orders set status='cancelled' where id=$1",[created.record.id]);
    await identity();
    await assert.rejects(write('complete_production_order',{id:created.record.id}),/MCP_(?:STATE_CONFLICT|RECORD_NOT_FOUND)/);
  });
});
