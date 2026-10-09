import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { actor, customer, session, resource } from './fixture.mjs';
import { initializeNativeDatabase } from './native-fixture.mjs';
let db,mcpClaims;
before(async()=>{db=new PGlite();mcpClaims=await initializeNativeDatabase(db);});
after(async()=>{await db?.close();});
async function isolated(run){await db.exec('begin');try{
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,session_id:session,role:'authenticated',aud:'authenticated'})]);
 await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'x-client-info':'factory-native-compat/1'})]);
 await db.exec('set local role authenticated'); await run();
}finally{await db.exec('rollback');}}
async function native(action,payload,key=randomUUID()){
 return (await db.query('select factory_native_write($1,$2::jsonb,$3::uuid) response',[action,JSON.stringify(payload),key])).rows[0].response.record;
}
async function scalar(query){return (await db.query(query)).rows[0].value;}
async function historical(operation,id){
 // Seed a pre-cutover record using the exact preserved original implementation.
 // The application-facing assertions below run as authenticated through public RPCs.
 await db.exec('reset role');
 await db.query(`select factory_private.legacy_${operation}($1)`,[id]);
 await db.exec('set local role authenticated');
}

test('historical and cached-native sales posting can be voided through new UI without invented cost effects',()=>isolated(async()=>{
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]});
 await historical('process_sales_invoice',invoice.id);
 const before=await scalar('select unit_cost value from finished_products where id=1');
 const key=randomUUID();const cancelled=await native('void_sales_invoice',{id:invoice.id},key);
 assert.equal(cancelled.status,'void');assert.equal(cancelled.legacy_valuation,true);
 assert.deepEqual(await native('void_sales_invoice',{id:invoice.id},key),cancelled);
 assert.equal(await scalar('select quantity::int value from finished_products where id=1'),10);
 assert.equal(await scalar('select unit_cost value from finished_products where id=1'),before);
 await db.exec('reset role');
 assert.equal(await scalar("select count(*)::int value from factory_private.execution_effects where kind='sales_invoices'"),0);
}));

test('historical completed production and packaging keep original native cancellation and costs',()=>isolated(async()=>{
 for(const kind of ['production','packaging']){
  const line=kind==='production'?{semi_finished_id:1,quantity:1}:{finished_product_id:1,quantity:1};
  const order=await native(`create_${kind}_order`,{date:'2026-10-09',items:[line]});
  await historical(`complete_${kind}_order_atomic`,order.id);
  const cost=await scalar('select unit_cost value from semi_finished_products where id=1');
  const cancelled=await native(`cancel_${kind}_order`,{id:order.id});
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.legacy_valuation,true);
  assert.equal(await scalar('select unit_cost value from semi_finished_products where id=1'),cost);
  await native(`cancel_${kind}_order`,{id:order.id});
 }
 assert.equal(await scalar('select quantity::int value from raw_materials where id=1'),100);
 assert.equal(await scalar('select quantity::int value from semi_finished_products where id=1'),10);
 assert.equal(await scalar('select quantity::int value from finished_products where id=1'),10);
}));

test('native manufactured valuation edit applies requested cost and replay retains exact persisted result',()=>isolated(async()=>{
 for(const kind of ['semi_finished_product','finished_product']){
  const key=randomUUID();const payload={id:1,name:'Explicit native valuation',unit_cost:17.25};
  const edited=await native(`edit_${kind}`,payload,key);
  assert.equal(edited.record.unit_cost,17.25);
  assert.deepEqual(await native(`edit_${kind}`,payload,key),edited);
 }
}));

test('explicit native proceed-anyway completes shortages once and records real effects',()=>isolated(async()=>{
 const order=await native('create_packaging_order',{date:'2026-10-09',items:[{finished_product_id:1,quantity:10}]});
 const key=randomUUID();const completed=await native('complete_packaging_order_allow_shortage',{id:order.id},key);
 assert.equal(completed.status,'completed');assert.equal(completed.shortage_accepted,true);
 assert.equal(await scalar('select quantity::int value from semi_finished_products where id=1'),-10);
 assert.equal(await scalar('select quantity::int value from finished_products where id=1'),20);
 assert.equal(await scalar(`select total_cost::float8 value from packaging_orders where id=${order.id}`),90);
 assert.equal(await scalar('select unit_cost::float8 value from finished_products where id=1'),7);
 assert.equal(completed.negative_stock[0].quantity,-10);
 assert.deepEqual(await native('complete_packaging_order_allow_shortage',{id:order.id},key),completed);
 const reversed=await native('cancel_packaging_order',{id:order.id});assert.equal(reversed.status,'cancelled');
 assert.equal(await scalar('select quantity::int value from semi_finished_products where id=1'),10);
 assert.equal(await scalar('select unit_cost::float8 value from finished_products where id=1'),5);
}));

test('native production preserves original deficient-stock quantities and WACO; replay and cached RPC apply once',()=>isolated(async()=>{
 await db.exec('reset role;update raw_materials set quantity=0 where id=1;set local role authenticated');
 const original=await native('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]});
 await historical('complete_production_order_atomic',original.id);
 const stock=async()=> (await db.query('select quantity::float8 quantity,unit_cost::float8 cost from semi_finished_products where id=1')).rows[0];
 const legacyStock=await stock(),legacyCost=await scalar(`select total_cost::float8 value from production_orders where id=${original.id}`);
 assert.equal(await scalar('select quantity::float8 value from raw_materials where id=1'),-1);
 await db.exec('reset role;update raw_materials set quantity=0 where id=1;update semi_finished_products set quantity=10,unit_cost=4 where id=1;set local role authenticated');
 const order=await native('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]});
 const movementsBefore=await scalar('select count(*)::int value from inventory_movements');
 const key=randomUUID(),completed=await native('complete_production_order',{id:order.id},key);
 assert.equal(completed.status,'completed');assert.equal(completed.negative_stock[0].quantity,-1);
 assert.deepEqual(await stock(),legacyStock);assert.equal(legacyCost,2);
 assert.equal(await scalar(`select total_cost::float8 value from production_orders where id=${order.id}`),legacyCost);
 assert.ok(Math.abs(legacyStock.cost-(40+2)/11)<1e-12);
 assert.equal(await scalar('select unit_cost::float8 value from raw_materials where id=1'),2);
 assert.deepEqual(await native('complete_production_order',{id:order.id},key),completed);
 await native('complete_production_order',{id:order.id});
 await db.query('select complete_production_order_atomic($1)',[order.id]);
 assert.equal(await scalar('select count(*)::int value from inventory_movements'),movementsBefore+2);
 assert.equal(await scalar('select quantity::float8 value from raw_materials where id=1'),-1);
 await db.exec('reset role');
 assert.equal(await scalar(`select count(*)::int value from factory_private.execution_effects where kind='production' and record_id=${order.id}`),1);
 await db.exec('set local role authenticated');await native('cancel_production_order',{id:order.id});
 assert.equal(await scalar('select quantity::float8 value from raw_materials where id=1'),0);
 assert.deepEqual(await stock(),{quantity:10,cost:4});
}));

test('real local OAuth MCP keeps strict production and packaging stock policy after native exceptions',()=>isolated(async()=>{
 for(const kind of ['production','packaging']){
  const line=kind==='production'?{semi_finished_id:1,quantity:1}:{finished_product_id:1,quantity:10};
  await db.exec('reset role;update raw_materials set quantity=0 where id=1;set local role authenticated');
  const order=await native(`create_${kind}_order`,{date:'2026-10-09',items:[line]});
  const initialCost=await scalar(`select total_cost::float8 value from ${kind}_orders where id=${order.id}`);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(mcpClaims)]);await db.exec('set local role factory_mcp_gateway');
  await db.exec('savepoint mcp_shortage');
  await assert.rejects(db.query('select factory_mcp_write($1,$2::jsonb,$3::uuid)',[`complete_${kind}_order`,JSON.stringify({id:order.id}),randomUUID()]),/MCP_STOCK_INSUFFICIENT/);
  await db.exec('rollback to mcp_shortage;reset role');
  assert.equal(await scalar(`select count(*)::int value from factory_private.execution_effects where kind='${kind}' and record_id=${order.id}`),0);
  assert.equal(await scalar(`select total_cost::float8 value from ${kind}_orders where id=${order.id}`),initialCost);
  assert.equal(await scalar(`select case when status='pending' then 1 else 0 end value from ${kind}_orders where id=${order.id}`),1);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,role:'authenticated',aud:'authenticated'})]);await db.exec('set local role authenticated');
 }
}));

test('native purchase-return deficiency preserves saved baseline; replay applies once and MCP stays strict',()=>isolated(async()=>{
 const supplier=randomUUID();await db.query("insert into parties(id,name,type)values($1,'Return supplier','supplier')",[supplier]);
 const payload={supplier_id:supplier,date:'2026-10-09',items:[{item_type:'raw_material',item_id:1,quantity:1,unit_price:5}]};
 await db.exec('reset role;update raw_materials set quantity=0 where id=1;set local role authenticated');
 const original=await native('create_purchase_return',payload);await historical('process_purchase_return',original.id);
 const baseline=(await db.query('select quantity::float8 quantity,unit_cost::float8 cost from raw_materials where id=1')).rows[0];
 const baselineBalance=await scalar(`select balance::float8 value from parties where id='${supplier}'`);
 assert.equal(baseline.quantity,-1);
 await db.exec('reset role;update raw_materials set quantity=0,unit_cost=2 where id=1');
 await db.query('update parties set balance=0 where id=$1',[supplier]);await db.exec('set local role authenticated');
 const returned=await native('create_purchase_return',payload),key=randomUUID();
 const posted=await native('post_purchase_return',{id:returned.id},key);assert.equal(posted.status,'posted');
 assert.deepEqual((await db.query('select quantity::float8 quantity,unit_cost::float8 cost from raw_materials where id=1')).rows[0],baseline);
 assert.equal(await scalar(`select balance::float8 value from parties where id='${supplier}'`),baselineBalance);
 assert.deepEqual(await native('post_purchase_return',{id:returned.id},key),posted);
 await db.query('select process_purchase_return($1)',[returned.id]);
 assert.equal(await scalar('select quantity::float8 value from raw_materials where id=1'),-1);
 const blocked=await native('create_purchase_return',payload);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(mcpClaims)]);await db.exec('set local role factory_mcp_gateway;savepoint return_shortage');
 await assert.rejects(db.query('select factory_mcp_write($1,$2::jsonb,$3::uuid)',['post_purchase_return',JSON.stringify({id:blocked.id}),randomUUID()]),/MCP_STOCK_INSUFFICIENT/);
 await db.exec('rollback to return_shortage;reset role');
 assert.equal(await scalar(`select count(*)::int value from factory_private.execution_effects where kind='purchase_returns' and record_id=${returned.id}`),1);
 assert.equal(await scalar(`select case when status='draft' then 1 else 0 end value from purchase_returns where id=${blocked.id}`),1);
}));

test('native purchase return still honors a saved original that rejects deficient stock',()=>isolated(async()=>{
 await db.exec('reset role');
 const source=readFileSync(new URL('../../supabase/migrations/20240114000008_fix_return_waco.sql',import.meta.url),'utf8');
 const definition=source.match(/CREATE OR REPLACE FUNCTION process_purchase_return\([\s\S]*?\$\$ LANGUAGE plpgsql;/i)?.[0];
 assert.ok(definition);
 await db.exec('drop function factory_private.legacy_process_purchase_return(bigint)');
 // Real historical strict implementation, adapted only to the current stock
 // column name; retain its original validation and accounting equations.
 await db.exec(definition.replace('FUNCTION process_purchase_return(','FUNCTION factory_private.legacy_process_purchase_return(').replaceAll('price_per_unit','unit_cost'));
 await db.exec('set local role authenticated');
 const supplier=randomUUID();await db.query("insert into parties(id,name,type)values($1,'Strict baseline','supplier')",[supplier]);
 const returned=await native('create_purchase_return',{supplier_id:supplier,date:'2026-10-09',items:[{item_type:'raw_material',item_id:1,quantity:1,unit_price:5}]});
 await db.exec('reset role;update raw_materials set quantity=0 where id=1;set local role authenticated');
 await db.exec('savepoint strict_original');await assert.rejects(native('post_purchase_return',{id:returned.id}),/Insufficient stock to return/);
 await db.exec('rollback to strict_original;reset role');
 assert.equal(await scalar(`select count(*)::int value from factory_private.execution_effects where kind='purchase_returns' and record_id=${returned.id}`),0);
 assert.equal(await scalar('select quantity::int value from raw_materials where id=1'),0);
}));

test('OAuth callers cannot use native historical, shortage or valuation paths',()=>isolated(async()=>{
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:session,role:'authenticated',aud:resource,client_id:'test-client'})]);
 await assert.rejects(native('complete_packaging_order_allow_shortage',{id:1}),/MCP_NATIVE_SESSION_REQUIRED/);
}));

test('cached public completion/cancellation and posting/voiding share effects and reject resurrection',()=>isolated(async()=>{
 const order=await native('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:2}]});
 await db.query('select complete_production_order_atomic($1)',[order.id]);
 await db.query('select complete_production_order_atomic($1)',[order.id]);
 await db.query('select cancel_production_order_atomic($1)',[order.id]);
 await db.query('select cancel_production_order_atomic($1)',[order.id]);
 assert.equal(await scalar('select quantity::int value from raw_materials where id=1'),100);
 await db.exec('savepoint cancelled');await assert.rejects(db.query('select complete_production_order_atomic($1)',[order.id]),/MCP_TRANSITION_INVALID/);await db.exec('rollback to cancelled');
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:1,unit_price:20}]});
 assert.equal((await db.query('select process_sales_invoice($1) response',[invoice.id])).rows[0].response.success,true);
 await db.query('select void_sales_invoice($1)',[invoice.id]);await db.query('select void_sales_invoice($1)',[invoice.id]);
 assert.equal(await scalar('select quantity::int value from finished_products where id=1'),10);
 await db.exec('savepoint voided');await assert.rejects(db.query('select process_sales_invoice($1)',[invoice.id]),/MCP_TRANSITION_INVALID/);await db.exec('rollback to voided');
}));

test('historical invoice void reverses later legacy settlements in their own treasuries',()=>isolated(async()=>{
 const a=(await native('create_treasury',{name:'Immediate till',type:'cash',opening_balance:100})).record;
 const b=(await native('create_treasury',{name:'Later till',type:'cash',opening_balance:100})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',treasury_id:a.id,paid_amount:20,items:[{item_type:'finished_product',item_id:1,quantity:4,unit_price:20}]});
 await historical('process_sales_invoice',invoice.id);
 await db.query("select handle_treasury_transaction($1::bigint,15::numeric,'income','receipt','Legacy later receipt',$2::uuid,$3::bigint,'sales')",[b.id,customer,invoice.id]);
 await native('void_sales_invoice',{id:invoice.id});
 assert.equal(await scalar(`select balance::int value from treasuries where id=${a.id}`),100);
 assert.equal(await scalar(`select balance::int value from treasuries where id=${b.id}`),100);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),0);
 assert.equal(await scalar('select quantity::int value from finished_products where id=1'),10);
 await native('void_sales_invoice',{id:invoice.id});assert.equal(await scalar(`select balance::int value from treasuries where id=${b.id}`),100);
}));

test('historical unpaid-header invoice refunds later receipt without a header treasury',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Later receipt',type:'cash',opening_balance:100})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]});
 await historical('process_sales_invoice',invoice.id);
 await db.query("select handle_treasury_transaction($1::bigint,10::numeric,'income','receipt','Later receipt',$2::uuid,$3::bigint,'sales')",[treasury.id,customer,invoice.id]);
 await native('void_sales_invoice',{id:invoice.id});
 assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),0);
}));

test('linked settlement deletion restores treasury, party and invoice paid amount atomically with audit receipt',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Settlement till',type:'cash',opening_balance:100})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:4,unit_price:20}]});
 await native('post_sales_invoice',{id:invoice.id});
 const settlement=await native('record_financial_transaction',{treasury_id:treasury.id,party_id:customer,invoice_id:invoice.id,invoice_type:'sales',type:'income',amount:20,category:'receipt'});
 const key=randomUUID();const deleted=await native('delete_financial_transaction',{id:settlement.id},key);
 assert.equal(deleted.original.invoice_id,invoice.id);assert.equal(deleted.status,'deleted');
 assert.deepEqual(await native('delete_financial_transaction',{id:settlement.id},key),deleted);
 assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),80);
 assert.equal(await scalar(`select paid_amount::int value from sales_invoices where id=${invoice.id}`),0);
 assert.equal(await scalar(`select count(*)::int value from financial_transactions where id=${settlement.id}`),0);
}));

test('immediate invoice payment deletion follows reference_type and preserves subsequent invoice void',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Immediate till',type:'cash',opening_balance:100})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',treasury_id:treasury.id,paid_amount:10,items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]});
 await native('post_sales_invoice',{id:invoice.id});
 const payment=(await db.query("select id from financial_transactions where reference_type='sales_invoice' and reference_id=$1",[String(invoice.id)])).rows[0];
 await native('delete_financial_transaction',{id:payment.id});
 assert.equal(await scalar(`select paid_amount::int value from sales_invoices where id=${invoice.id}`),0);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),40);
 await native('void_sales_invoice',{id:invoice.id});
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),0);
 assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
}));

test('new and historical treasury transfer deletion requires explicitly selected reciprocal leg',()=>isolated(async()=>{
 const a=(await native('create_treasury',{name:'From',type:'cash',opening_balance:100})).record;
 const b=(await native('create_treasury',{name:'To',type:'cash',opening_balance:100})).record;
 for(const generation of ['new','old']){
  if(generation==='new')await native('transfer_treasury',{from_id:a.id,to_id:b.id,amount:20,description:'Transfer'});
  else await db.query('select transfer_between_treasuries($1::bigint,$2::bigint,20::numeric,$3)',[a.id,b.id,'Historic transfer']);
  const out=(await db.query("select id from financial_transactions where category='transfer_out' order by id desc limit 1")).rows[0];
  const plan=(await db.query('select factory_native_financial_reversal_plan($1) response',[out.id])).rows[0].response;
  assert.equal(plan.requires_pair,true);assert.equal(plan.candidates.length,1);
  await db.exec('savepoint pair');await assert.rejects(native('delete_financial_transaction',{id:out.id}),/MCP_TRANSFER_PAIR_REQUIRED/);await db.exec('rollback to pair');
  await native('delete_financial_transaction',{id:out.id,pair_id:plan.candidates[0].id});
  assert.equal(await scalar(`select balance::int value from treasuries where id=${a.id}`),100);
  assert.equal(await scalar(`select balance::int value from treasuries where id=${b.id}`),100);
 }
}));

test('all operating roles succeed in their domains; viewer and cross-domain writes stay denied',()=>isolated(async()=>{
 const cases={admin:['inventory','production','finance'],manager:['inventory','production','finance'],inventory_officer:['inventory'],production_officer:['production'],accountant:['finance'],viewer:[]};
 for(const [role,domains] of Object.entries(cases)){
  await db.exec('reset role');await db.query('update profiles set role=$1::app_role where id=$2',[role,actor]);await db.exec('set local role authenticated');
  if(domains.includes('inventory')){
   const raw=(await native('create_raw_material',{name:`Material ${role}`,unit:'kg',quantity:1,unit_cost:2})).record;assert.ok(raw.id);
   const st=await native('create_stocktake',{date:'2026-10-09',type:'partial'});await native('start_stocktake',{id:st.id,raw:true,packaging:false,semi:false,finished:false});await native('reconcile_stocktake',{id:st.id});
  }
  if(domains.includes('production')){
   const order=await native('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]});
   await db.query('select complete_production_order_atomic($1)',[order.id]);await native('cancel_production_order',{id:order.id});
  }
  if(domains.includes('finance')){
   const treasury=(await native('create_treasury',{name:`Till ${role}`,type:'cash',opening_balance:100})).record;
   const transaction=await native('record_financial_transaction',{treasury_id:treasury.id,type:'expense',amount:5,category:'rent'});await native('delete_financial_transaction',{id:transaction.id});
   const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:1,unit_price:20}]});await db.query('select process_sales_invoice($1)',[invoice.id]);await native('void_sales_invoice',{id:invoice.id});
  }
  if(!domains.includes('finance')){
   await db.exec('savepoint role_denied');await assert.rejects(native('create_treasury',{name:'Denied',type:'cash'}),/MCP_ACCESS_FORBIDDEN/);await db.exec('rollback to role_denied');
  }
 }
}));

test('historical purchase invoice and both return voids retain native capability',()=>isolated(async()=>{
 const supplier=randomUUID();await db.query("insert into parties(id,name,type)values($1,'Legacy supplier','supplier')",[supplier]);
 const treasury=(await native('create_treasury',{name:'Purchases',type:'cash',opening_balance:100})).record;
 const purchase=await native('create_purchase_invoice',{supplier_id:supplier,date:'2026-10-09',treasury_id:treasury.id,paid_amount:5,items:[{item_type:'raw_material',item_id:1,quantity:2,unit_price:5}]});
 await historical('process_purchase_invoice',purchase.id);await native('void_purchase_invoice',{id:purchase.id});
 assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
 assert.equal(await scalar(`select balance::int value from parties where id='${supplier}'`),0);
 for(const kind of ['sales','purchase']){
  const invoice=await native(`create_${kind}_invoice`,{[kind==='sales'?'customer_id':'supplier_id']:kind==='sales'?customer:supplier,date:'2026-10-09',items:[{item_type:'raw_material',item_id:1,quantity:2,unit_price:5}]});
  await native(`post_${kind}_invoice`,{id:invoice.id});
  const returned=await native(`create_${kind}_return`,{[kind==='sales'?'customer_id':'supplier_id']:kind==='sales'?customer:supplier,original_invoice_id:invoice.id,date:'2026-10-09',items:[{item_type:'raw_material',item_id:1,quantity:1,unit_price:5}]});
  await historical(`process_${kind}_return`,returned.id);
  const voided=await native(`void_${kind}_return`,{id:returned.id});assert.equal(voided.status,'void');assert.equal(voided.legacy_valuation,true);
 }
}));

test('legacy stocktake without starts metadata keeps recorded counts and preserves later stock',()=>isolated(async()=>{
 const id=(await db.query("insert into inventory_count_sessions(code,date,type,status)values('LEGACY-ST',current_date,'partial','in_progress')returning id")).rows[0].id;
 await db.query("insert into inventory_count_items(session_id,item_type,item_id,product_name,unit,system_quantity,counted_quantity,unit_cost)values($1,'raw_material',1,'Raw','kg',100,90,2)",[id]);
 await db.exec('reset role;update raw_materials set quantity=120 where id=1;set local role authenticated');
 await native('reconcile_stocktake',{id});await native('reconcile_stocktake',{id});
 assert.equal(await scalar('select quantity::int value from raw_materials where id=1'),110);
 assert.equal(await scalar('select unit_cost::int value from raw_materials where id=1'),2);
}));

test('failed financial reversal rolls back all balances and already-reversed rows remain protected',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Receipt till',type:'cash',opening_balance:0})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]});await native('post_sales_invoice',{id:invoice.id});
 const receipt=await native('record_financial_transaction',{treasury_id:treasury.id,party_id:customer,invoice_id:invoice.id,invoice_type:'sales',type:'income',amount:10,category:'receipt'});
 await native('record_financial_transaction',{treasury_id:treasury.id,type:'expense',amount:10,category:'rent'});
 await db.exec('savepoint no_cash');await assert.rejects(native('delete_financial_transaction',{id:receipt.id}),/MCP_TREASURY_INSUFFICIENT/);await db.exec('rollback to no_cash');
 assert.equal(await scalar(`select paid_amount::int value from sales_invoices where id=${invoice.id}`),10);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),30);
 await db.exec('reset role');await db.query("insert into financial_transactions(treasury_id,amount,transaction_type,category,reference_type,reference_id)values($1,10,'expense','reversal_receipt','MCP_REVERSAL',$2)",[treasury.id,String(receipt.id)]);await db.exec('set local role authenticated');
 await db.exec('savepoint reversed');await assert.rejects(native('delete_financial_transaction',{id:receipt.id}),/MCP_FINANCIAL_ALREADY_REVERSED/);await db.exec('rollback to reversed');
}));

test('new frontend with unavailable compatibility RPC fails explicitly instead of executing a partial write',()=>isolated(async()=>{
 await db.exec('reset role;revoke execute on function factory_native_write(text,jsonb,uuid) from authenticated;set local role authenticated');
 await db.exec('savepoint unavailable_rpc');
 await assert.rejects(native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:1,unit_price:20}]}),/permission denied/);
 await db.exec('rollback to unavailable_rpc');
 assert.equal(await scalar('select count(*)::int value from sales_invoices'),0);
}));

test('deleting an earlier invoice refund cannot overpay after a later settlement',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Refund till',type:'cash',opening_balance:100})).record;
 const invoice=await native('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:1,unit_price:100}]});
 await native('post_sales_invoice',{id:invoice.id});
 const linked={treasury_id:treasury.id,party_id:customer,invoice_id:invoice.id,invoice_type:'sales'};
 await native('record_financial_transaction',{...linked,type:'income',amount:100,category:'receipt'});
 const refund=await native('record_financial_transaction',{...linked,type:'expense',amount:50,category:'refund'});
 await native('record_financial_transaction',{...linked,type:'income',amount:50,category:'receipt'});
 await db.exec('savepoint overpayment');
 await assert.rejects(native('delete_financial_transaction',{id:refund.id}),/MCP_SETTLEMENT_AMOUNT_INVALID/);
 await db.exec('rollback to overpayment');
 assert.equal(await scalar(`select paid_amount::int value from sales_invoices where id=${invoice.id}`),100);
 assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),200);
 assert.equal(await scalar(`select balance::int value from parties where id='${customer}'`),0);
 assert.equal(await scalar(`select count(*)::int value from financial_transactions where id=${refund.id}`),1);
}));

test('cached old finance requests stop before any cash/party/invoice effect, even zero-row deletion',()=>isolated(async()=>{
 const treasury=(await native('create_treasury',{name:'Cached finance',type:'cash',opening_balance:100})).record;
 await db.exec("select set_config('request.headers','{}',true)");
 for(const statement of [
  `insert into financial_transactions(treasury_id,amount,transaction_type,category)values(${treasury.id},10,'income','receipt')`,
  'delete from financial_transactions where id=-1',
  `select handle_treasury_transaction(${treasury.id}::bigint,10::numeric,'income','receipt','Cached receipt',null::uuid,null::bigint,null::text)`
 ]){
  await db.exec('savepoint old_finance');await assert.rejects(db.exec(statement),/حدّث صفحة التطبيق/);await db.exec('rollback to old_finance');
  assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
 }
 await db.exec("select set_config('request.headers','{\"x-client-info\":\"factory-native-compat/1\"}',true)");
 const restored=(await db.query("insert into financial_transactions(treasury_id,amount,transaction_type,category)values($1,1,'income','backup_restore')returning id",[treasury.id])).rows[0];
 await db.query('delete from financial_transactions where id=$1',[restored.id]);
 const receipt=await native('record_financial_transaction',{treasury_id:treasury.id,type:'income',amount:10,category:'general'});
 await native('delete_financial_transaction',{id:receipt.id});assert.equal(await scalar(`select balance::int value from treasuries where id=${treasury.id}`),100);
}));

test('compatibility rollback restores every cached RPC definition, owner and grants without losing business evidence',async()=>{
 const recovery=new PGlite();try{
  await initializeNativeDatabase(recovery);
  const originals=(await recovery.query('select * from factory_private.native_rpc_originals')).rows;
  assert.equal(originals.length,12);
  const counts=async()=> (await recovery.query('select (select count(*)::int from factory_private.write_receipts) receipts,(select count(*)::int from raw_materials) materials,(select count(*)::int from auth.sessions) sessions')).rows[0];
  const before=await counts();
  await recovery.exec(readFileSync(new URL('../../docs/MCP-COMPATIBILITY-ROLLBACK.sql',import.meta.url),'utf8'));
  for(const original of originals){
   const actual=(await recovery.query('select pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner_name from pg_proc p where p.oid=$1::regprocedure',[original.identity])).rows[0];
   assert.equal(actual.definition,original.definition);assert.equal(actual.owner_name,original.owner_name);
   const grants=(await recovery.query("select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type privilege,a.is_grantable grantable from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure",[original.identity])).rows;
   const sorted=items=>items.map(item=>JSON.stringify([item.grantee,item.privilege,item.grantable])).sort();assert.deepEqual(sorted(grants),sorted(original.privileges));
  }
  assert.deepEqual(await counts(),before);
  assert.equal((await recovery.query("select count(*)::int n from pg_trigger where tgname='native_financial_client'")).rows[0].n,0);
  for(const name of ['factory_native_write(text,jsonb,uuid)','factory_native_financial_reversal_plan(bigint)']){
   assert.equal((await recovery.query("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[name])).rows[0].allowed,false);
  }
 }finally{await recovery.close();}
});
