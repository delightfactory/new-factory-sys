import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { fixtureSql, actor, customer, session, resource } from './fixture.mjs';
import { registerReportCases } from './report-cases.mjs';
let db;
before(async()=>{
 db=new PGlite(); await db.exec(fixtureSql());
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009140827_comprehensive_mcp_operations.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
async function isolated(fn){await db.exec('begin'); try{
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,role:'authenticated',session_id:session,client_id:'test-client',aud:resource})]); await fn();
 }finally{await db.exec('rollback');}}
async function write(action,payload,key=randomUUID()){
 const result=await db.query('select factory_mcp_write($1,$2::jsonb,$3::uuid) result',[action,JSON.stringify(payload),key]); return result.rows[0].result.record;
}
async function value(sql){return (await db.query(sql)).rows[0].value;}
test('purchase, partial settlement across treasuries and void preserve ledgers and replay',()=>isolated(async()=>{
 const supplier=randomUUID(); await db.query("insert into parties(id,name,type)values($1,'Supplier','supplier')",[supplier]);
 await db.exec("insert into treasuries(name,type,balance)values('Cash A','cash',1000),('Cash B','cash',1000)");
 const key=randomUUID(); const payload={supplier_id:supplier,date:'2026-10-09',treasury_id:1,paid_amount:20,tax_amount:10,items:[{item_type:'raw_material',item_id:1,quantity:10,unit_price:5}]};
 const invoice=await write('create_purchase_invoice',payload,key); assert.equal(invoice.total_amount,60);
 assert.deepEqual(await write('create_purchase_invoice',payload,key),invoice);
 await write('post_purchase_invoice',{id:invoice.id});
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),110);
 assert.equal(await value('select unit_cost::float value from raw_materials where id=1'),260/110);
 assert.equal(await value(`select balance::float value from parties where id='${supplier}'`),-40);
 await write('record_financial_transaction',{treasury_id:2,party_id:supplier,invoice_id:invoice.id,invoice_type:'purchase',type:'expense',amount:15,category:'payment'});
 assert.equal(await value('select balance::float value from treasuries where id=2'),985);
 await write('void_purchase_invoice',{id:invoice.id});
 assert.equal(await value('select balance::float value from treasuries where id=1'),1000);
 assert.equal(await value('select balance::float value from treasuries where id=2'),1000);
 assert.equal(await value(`select balance::float value from parties where id='${supplier}'`),0);
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),100);
 assert.equal(await value('select unit_cost::float value from raw_materials where id=1'),2);
}));
test('linked partial returns enforce aggregate original quantities and rollback excess',()=>isolated(async()=>{
 const invoice=await write('create_sales_invoice',{customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:4,unit_price:20}]}); await write('post_sales_invoice',{id:invoice.id});
 const ret=await write('create_sales_return',{customer_id:customer,date:'2026-10-09',original_invoice_id:invoice.id,items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]}); await write('post_sales_return',{id:ret.id});
 const over=await write('create_sales_return',{customer_id:customer,date:'2026-10-09',original_invoice_id:invoice.id,items:[{item_type:'finished_product',item_id:1,quantity:1.5,unit_price:20},{item_type:'finished_product',item_id:1,quantity:1,unit_price:20}]});
 await db.exec('savepoint excessive'); await assert.rejects(write('post_sales_return',{id:over.id}),/MCP_RETURN_QUANTITY_EXCEEDED/); await db.exec('rollback to excessive');
 assert.equal(await value('select quantity::float value from finished_products where id=1'),8);
 await db.exec('savepoint hasreturn'); await assert.rejects(write('void_sales_invoice',{id:invoice.id}),/MCP_VOID_RETURNS_FIRST/); await db.exec('rollback to hasreturn');
 await write('void_sales_return',{id:ret.id}); await write('void_sales_invoice',{id:invoice.id}); assert.equal(await value('select quantity::float value from finished_products where id=1'),10);
}));
test('production reversal uses execution effects after recipe edit and preserves original cost value',()=>isolated(async()=>{
 const order=await write('create_production_order',{date:'2026-10-09',items:[{semi_finished_id:1,quantity:10}]}); await write('complete_production_order',{id:order.id});
 await write('update_semi_finished_product',{id:1,ingredients:[{raw_material_id:1,quantity:20}]});
 await write('cancel_production_order',{id:order.id});
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),100);
 assert.equal(await value('select quantity::float value from semi_finished_products where id=1'),10);
 assert.equal(await value('select unit_cost::float value from semi_finished_products where id=1'),4);
 await write('cancel_production_order',{id:order.id}); assert.equal(await value('select quantity::float value from raw_materials where id=1'),100);
}));
test('assembly costs preserve prior WACO and completed reversal is explicitly unsupported',()=>isolated(async()=>{
 const bundle=await write('create_bundle',{name:'Gift',bundle_price:50,items:[{item_type:'finished_product',item_id:1,quantity:2}]});
 await db.query('update product_bundles set quantity=2,unit_cost=20 where id=$1',[bundle.id]);
 const order=await write('create_bundle_assembly_order',{date:'2026-10-09',items:[{bundle_id:bundle.id,quantity:2}]}); await write('complete_bundle_assembly_order',{id:order.id});
 assert.equal(await value(`select quantity::float value from product_bundles where id=${bundle.id}`),4);
 assert.equal(await value(`select unit_cost::float value from product_bundles where id=${bundle.id}`),15);
 await write('complete_bundle_assembly_order',{id:order.id}); assert.equal(await value('select quantity::float value from finished_products where id=1'),6);
 await db.exec('savepoint reversebundle'); await assert.rejects(write('cancel_bundle_assembly_order',{id:order.id}),/MCP_BUNDLE_REVERSAL_NOT_SUPPORTED/); await db.exec('rollback to reversebundle');
}));
test('stocktake delta preserves later stock changes and cost, then repeats once',()=>isolated(async()=>{
 const st=await write('create_stocktake',{date:'2026-10-09',type:'partial'}); await write('start_stocktake',{id:st.id,raw:true,packaging:false,semi:false,finished:false});
 const item=(await db.query('select id from inventory_count_items where session_id=$1',[st.id])).rows[0].id;
 await write('record_stocktake_counts',{id:st.id,counts:[{item_id:item,counted_quantity:90}]});
 await write('adjust_inventory',{item_type:'raw_material',item_id:1,quantity:120,unit_cost:3,reason:'Later receipt'});
 const result=await write('reconcile_stocktake',{id:st.id}); assert.equal(result.effects[0].after_quantity,110);
 await write('reconcile_stocktake',{id:st.id}); assert.equal(await value('select quantity::float value from raw_materials where id=1'),110); assert.equal(await value('select unit_cost::float value from raw_materials where id=1'),3);
}));
test('packaging shortage journey creates production and completes packaging atomically with repeat safety',()=>isolated(async()=>{
 const order=await write('create_packaging_order',{date:'2026-10-09',items:[{finished_product_id:1,quantity:10}]});
 const key=randomUUID(); const result=await write('fulfill_packaging_order',{id:order.id},key);
 assert.equal(result.status,'completed'); assert.equal(result.atomic,true); assert.equal(result.production.status,'completed');
 assert.equal(await value('select quantity::float value from semi_finished_products where id=1'),0);
 assert.equal(await value('select quantity::float value from finished_products where id=1'),20);
 assert.deepEqual(await write('fulfill_packaging_order',{id:order.id},key),result);
 await write('fulfill_packaging_order',{id:order.id});
 assert.equal(await value('select count(*)::int value from production_orders'),1);
}));
test('failed packaging phase rolls back shortage production, stock and child receipts',()=>isolated(async()=>{
 await db.exec('update packaging_materials set quantity=0 where id=1');
 const order=await write('create_packaging_order',{date:'2026-10-09',items:[{finished_product_id:1,quantity:10}]});
 const before=await value('select count(*)::int value from factory_private.write_receipts');
 await db.exec('savepoint failedjourney'); await assert.rejects(write('fulfill_packaging_order',{id:order.id})); await db.exec('rollback to failedjourney');
 assert.equal(await value('select count(*)::int value from production_orders'),0);
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),100);
 assert.equal(await value('select quantity::float value from semi_finished_products where id=1'),10);
 assert.equal(await value('select count(*)::int value from factory_private.write_receipts'),before);
}));
test('role checks deny financial/inventory/production cross-domain writes and restore receipts on failure',()=>isolated(async()=>{
 await db.query("update profiles set role='production_officer' where id=$1",[actor]);
 await db.exec('savepoint denied'); await assert.rejects(write('record_financial_transaction',{treasury_id:1,type:'income',category:'general',amount:1}),/MCP_ACCESS_FORBIDDEN/); await db.exec('rollback to denied');
 await db.exec('savepoint stockdenied'); await assert.rejects(write('create_raw_material',{name:'New',unit:'kg'}),/MCP_ACCESS_FORBIDDEN/); await db.exec('rollback to stockdenied');
 assert.equal(await value('select count(*)::int value from factory_private.write_receipts'),0);
}));
async function query(kind,payload){return(await db.query('select factory_mcp_query($1,$2::jsonb) result',[kind,JSON.stringify(payload)])).rows[0].result;}
test('native edit requires an existing id and preserves stock valuation while changing recipe',()=>isolated(async()=>{
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,role:'authenticated',session_id:session,aud:'authenticated'})]);
 const call=(payload)=>db.query('select factory_write($1,$2::jsonb,$3::uuid) result',['edit_semi_finished_product',JSON.stringify(payload),randomUUID()]);
 const result=(await call({id:1,name:'Edited mix',quantity:12,unit_cost:999,ingredients:[{raw_material_id:1,quantity:20}]})).rows[0].result;
 assert.equal(result.record.record.quantity,12);assert.equal(result.record.record.unit_cost,4);
 await db.exec('savepoint missingid');await assert.rejects(call({name:'Invalid'}),/MCP_INPUT_INVALID/);await db.exec('rollback to missingid');
 assert.equal(await value('select count(*)::int value from semi_finished_products'),1);
}));
test('recipe rejects nonnumeric quantities atomically without deleting existing components',()=>isolated(async()=>{
 for(const [action,payload] of [
  ['update_semi_finished_product',{id:1,ingredients:[{raw_material_id:1,quantity:'NaN'}]}],
  ['update_finished_product',{id:1,packaging:[{packaging_material_id:1,quantity:'NaN'}]}],
  ['create_bundle',{name:'Invalid',bundle_price:10,items:[{item_type:'finished_product',item_id:1,quantity:'NaN'}]}]]){
  await db.exec('savepoint invalidrecipe');await assert.rejects(write(action,payload),/MCP_INPUT_INVALID/);await db.exec('rollback to invalidrecipe');
 }
 assert.equal(await value('select quantity::float value from semi_finished_ingredients where semi_finished_id=1'),10);
 assert.equal(await value('select quantity::float value from finished_product_packaging where finished_product_id=1'),1);
 assert.equal(await value('select unit_cost::float value from semi_finished_products where id=1'),4);
}));
registerReportCases({test,assert,isolated,query,write,sql:(statement,args)=>db.query(statement,args),value,actor,customer});
test('all eighteen named reports execute actual source schema and expose complete summaries',()=>isolated(async()=>{
 for(const report of ['dashboard','pnl','balance_sheet','cash_flow','aging','inventory','inventory_analytics','low_stock','turnover','production','product_performance','decision_support','party_analysis','expense_analysis','cost_card','pricing_analysis','trends','product_journey']){
  try {const result=await query('report',{report,...(['cost_card','product_journey'].includes(report)?{item_id:1}:{}),as_of:'2026-10-09',limit:2}); assert.ok(result.snapshot_id); assert.ok(result.summary); assert.equal(result.total_count>=result.rows.length,true);}
  catch(error){throw new Error(`${report}: ${error.message}; ${error.internalQuery??''}; ${error.where??''}`);}
 }
}));
test('report pagination above 1000 rows retains full totals and a frozen owner-bound snapshot',()=>isolated(async()=>{
 await db.exec("insert into raw_materials(code,name,unit,quantity,unit_cost)select 'M'||n,'Material '||n,'kg',1,2 from generate_series(1,1001)n");
 const first=await query('report',{report:'inventory',item_type:'raw_material',limit:250,sort_by:'quantity',descending:true,as_of:'2026-10-09'}); assert.equal(first.total_count,1002); assert.equal(first.summary.quantity,1101);
 await db.exec("update raw_materials set quantity=999 where code='M1'");
 let seen=first.rows.length; let page=first; const ids=new Set(first.rows.map(x=>x.row_key));
 while(page.has_more){page=await query('report',{report:'inventory',snapshot_id:first.snapshot_id,offset:page.next_offset,limit:250}); for(const row of page.rows){assert.equal(ids.has(row.row_key),false);ids.add(row.row_key);} seen+=page.rows.length; assert.deepEqual(page.summary,first.summary);}
 assert.equal(seen,1002);
 await db.exec('savepoint sortconflict'); await assert.rejects(query('report',{report:'inventory',snapshot_id:first.snapshot_id,sort_by:'value'}),/MCP_REPORT_FILTER_CONFLICT/); await db.exec('rollback to sortconflict');
 await db.exec('savepoint badclient'); await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,role:'authenticated',session_id:session,client_id:'other',aud:resource})]); await assert.rejects(query('report',{report:'inventory',snapshot_id:first.snapshot_id}),/MCP_ACCESS_FORBIDDEN/); await db.exec('rollback to badclient');
}));
test('statements include opening balances and all rows; protected admin handoff cannot execute',()=>isolated(async()=>{
 await db.exec("insert into treasuries(id,name,type,balance)values(1,'Cash','cash',100)");
 await write('record_financial_transaction',{treasury_id:1,party_id:customer,type:'income',category:'receipt',amount:10,date:'2026-10-09'});
 const statement=await query('treasury_statement',{treasury_id:1,start_date:'2026-10-09',end_date:'2026-10-09'}); assert.equal(statement.summary.opening_balance,100); assert.equal(statement.summary.closing_balance,110); assert.equal(statement.total_count,1);
 const handoff=await query('protected_handoff',{action:'factory_reset'}); assert.equal(handoff.executed,false); assert.equal(handoff.status,'awaiting_specific_human_approval'); assert.equal(await value('select count(*)::int value from raw_materials'),1);
 const manifest=await query('backup_manifest',{}); assert.equal(manifest.table_count,31); assert.equal(manifest.tables.some(x=>x.table==='profiles'),false);
}));
test('record child pages freeze header and bundle parent filtering matches the correct key',()=>isolated(async()=>{
 const bundle=await write('create_bundle',{name:'Mixed',bundle_price:30,items:[{item_type:'finished_product',item_id:1,quantity:1},{item_type:'raw_material',item_id:1,quantity:2}]});
 const first=await query('get_record',{resource:'product_bundles',id:bundle.id,limit:1});assert.equal(first.lines.total_count,2);
 await db.query("update product_bundles set name='Changed' where id=$1",[bundle.id]);
 const next=await query('get_record',{resource:'product_bundles',id:bundle.id,snapshot_id:first.lines.snapshot_id,offset:1,limit:1});
 assert.equal(next.record.name,'Mixed');assert.notDeepEqual(first.lines.rows,next.lines.rows);
}));
test('backup pages share one frozen multi-table snapshot and unsupported filters are rejected',()=>isolated(async()=>{
 const manifest=await query('backup_manifest',{});
 await db.exec("update raw_materials set quantity=999 where id=1;update finished_products set quantity=999 where id=1");
 const raw=await query('backup_export',{table:'raw_materials',snapshot_id:manifest.snapshot_id});
 const finished=await query('backup_export',{table:'finished_products',snapshot_id:manifest.snapshot_id});
 assert.equal(raw.rows[0].quantity,100);assert.equal(finished.rows[0].quantity,10);assert.equal(raw.captured_at,finished.captured_at);
 await db.exec('savepoint unsupportedfilter');await assert.rejects(query('report',{report:'pnl',party_id:customer}),/MCP_INPUT_INVALID/);await db.exec('rollback to unsupportedfilter');
 await db.exec('savepoint backupfilter');await assert.rejects(query('backup_export',{table:'raw_materials',snapshot_id:manifest.snapshot_id,search:'No'}),/MCP_INPUT_INVALID/);await db.exec('rollback to backupfilter');
}));
test('movement type filter maps domain kind to stored movement table type',()=>isolated(async()=>{
 await write('adjust_inventory',{item_type:'raw_material',item_id:1,quantity:101,reason:'Count correction'});
 const result=await query('list_records',{resource:'inventory_movements',item_type:'raw_material',item_id:1});assert.equal(result.total_count,1);assert.equal(result.rows[0].quantity,1);
}));
test('native commands need no MCP grant and retain displayed codes; manual deletion reverses once',()=>isolated(async()=>{
 await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,role:'authenticated',session_id:session,aud:'authenticated'})]);
 await db.exec('delete from factory_private.mcp_access');
 const command=async(action,payload)=>(await db.query('select factory_write($1,$2::jsonb,$3::uuid) result',[action,JSON.stringify(payload),randomUUID()])).rows[0].result.record;
 const order=await command('create_production_order',{code:'PR-UI-0001',date:'2026-10-09',items:[{semi_finished_id:1,quantity:1}]});assert.equal(order.code,'PR-UI-0001');
 const treasury=(await command('create_treasury',{name:'Native cash',type:'cash',opening_balance:100})).record;
 const tx=await command('record_financial_transaction',{treasury_id:treasury.id,type:'expense',amount:20,category:'rent'});
 await command('delete_financial_transaction',{id:tx.id});await command('delete_financial_transaction',{id:tx.id});
 assert.equal(await value(`select balance::float value from treasuries where id=${treasury.id}`),100);
}));
test('MCP atomic stock edit preserves retry, quantity and cost in one intent',()=>isolated(async()=>{
 const key=randomUUID();const payload={id:1,name:'Atomic remote name',quantity:120,unit_cost:3,reason:'Approved correction'};
 const result=await write('edit_raw_material',payload,key);assert.deepEqual(await write('edit_raw_material',payload,key),result);
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),120);
 assert.equal(await value('select unit_cost::float value from raw_materials where id=1'),3);
 assert.equal(await value('select count(*)::int value from inventory_movements'),1);
 await db.exec('savepoint failed_edit');
 await assert.rejects(write('edit_raw_material',{id:1,name:'Must roll back',quantity:-1,reason:'Invalid correction'}),/MCP_INPUT_INVALID/);
 await db.exec('rollback to failed_edit');
 assert.equal(await value('select name value from raw_materials where id=1'),'Atomic remote name');
 assert.equal(await value('select quantity::float value from raw_materials where id=1'),120);
}));
test('protected deletion gives exact native route and blocks linked finance reversal',()=>isolated(async()=>{
 const target=await query('protected_handoff',{action:'delete_record',resource:'raw_materials',record_id:1});assert.equal(target.executed,false);assert.equal(target.path,'/inventory/raw-materials');
 const treasury=(await write('create_treasury',{name:'Protected till',type:'cash',opening_balance:100})).record;
 const transaction=await write('record_financial_transaction',{treasury_id:treasury.id,party_id:customer,type:'income',amount:10,category:'receipt'});
 const handoff=await query('protected_handoff',{action:'delete_financial_transaction',record_id:transaction.id});
 assert.equal(handoff.executed,false);assert.equal(handoff.status,'blocked_reversal_requires_review');assert.equal(handoff.path,'/commercial/payments');
 assert.equal(await value(`select balance::float value from treasuries where id=${treasury.id}`),110);
}));
