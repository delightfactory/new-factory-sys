import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {createApp} from '../server.mjs';
import {fixtureSql,actor,customer,session,resource} from './fixture.mjs';
import {consentAndIssue,oauthClient} from './oauth-fixture.mjs';

test('full consent/token/signed SDK journey persists commands, results, paging and live role/consent denial',async t=>{
 const db=new PGlite(); t.after(()=>db.close()); await db.exec(fixtureSql());
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009140827_comprehensive_mcp_operations.sql',import.meta.url),'utf8'));
 const issuedClaims=await consentAndIssue(db);
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261009161500_readonly_mcp_analytics.sql',import.meta.url),'utf8'));
 await db.exec('set role factory_mcp_gateway');
 // Adapt PGlite's actual SQL connection to pg.Pool's interface. Identity checks,
 // role grants, receipts, domain logic and transactions all execute in PostgreSQL.
 let tail=Promise.resolve();
 const pool={connect:async()=>{const previous=tail;let unlock;tail=new Promise(resolve=>{unlock=resolve;});await previous;return{query:(sql,args)=>db.query(sql,args),release:unlock};}};
 const issuer='https://auth.example/auth/v1'; const {privateKey,publicKey}=await generateKeyPair('ES256');
 const jwk=await exportJWK(publicKey);jwk.kid='journey';
 const token=await new SignJWT(issuedClaims).setProtectedHeader({alg:'ES256',kid:jwk.kid}).setIssuer(issuer).sign(privateKey);
 const app=createApp({resource,issuer,clientIds:[oauthClient],appOrigin:'https://factory.example',writesEnabled:true,jwks:createLocalJWKSet({keys:[jwk]})},{pool});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const client=new Client({name:'factory-journey',version:'1'});t.after(()=>client.close());
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/api/mcp`),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
 async function call(name,args){const response=await client.callTool({name:`factory_${name}`,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response.content));return response.structuredContent;}
 async function write(name,payload,key=randomUUID()){return(await call(name,{...payload,request_id:key})).record;}
 const allowedSchema=await call('schema',{});assert.ok(allowedSchema.tables.raw_materials);
 const analysis=await call('analyze',{from:{table:'raw_materials',alias:'a0'},select:[{as:'stock_value',expr:{kind:'aggregate',fn:'sum',expr:{kind:'product',left:{alias:'a0',column:'quantity'},right:{alias:'a0',column:'unit_cost'}}}}],limit:1});assert.equal(analysis.rows[0].stock_value,200);assert.equal(analysis.execution_role,'authenticated');
 const treasury=await write('create_treasury',{name:'Till',type:'cash',opening_balance:100});
 const key=randomUUID();const payload={customer_id:customer,date:'2026-10-09',items:[{item_type:'finished_product',item_id:1,quantity:2,unit_price:20}]};
 const invoice=await write('create_sales_invoice',payload,key);assert.equal(invoice.total_amount,40);assert.ok(invoice.number);
 assert.deepEqual(await write('create_sales_invoice',payload,key),invoice);
 await write('post_sales_invoice',{id:invoice.id});
 await write('record_financial_transaction',{treasury_id:treasury.id,party_id:customer,invoice_id:invoice.id,invoice_type:'sales',type:'income',amount:10,category:'receipt',date:'2026-10-09'});
 const shown=await call('get_record',{resource:'sales_invoices',id:invoice.id});assert.equal(shown.record.status,'posted');assert.equal(shown.record.paid_amount,10);assert.equal(shown.lines.total_count,1);
 const statement=await call('party_statement',{party_id:customer});assert.equal(statement.summary.closing_balance,30);assert.equal(statement.summary.opening_balance,0);
 const report=await call('report',{report:'inventory',limit:1});assert.equal(report.has_more,true);
 const next=await call('report',{report:'inventory',snapshot_id:report.snapshot_id,offset:report.next_offset,limit:1});assert.equal(next.total_count,report.total_count);assert.notDeepEqual(next.rows,report.rows);
 const handoff=await call('protected_handoff',{action:'factory_reset'});assert.equal(handoff.executed,false);
 await db.exec('reset role');await db.query("update profiles set role='production_officer' where id=$1",[actor]);await db.exec('set role factory_mcp_gateway');
 const denied=await client.callTool({name:'factory_record_financial_transaction',arguments:{request_id:randomUUID(),treasury_id:treasury.id,type:'income',amount:1,category:'general'}});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/MCP_ACCESS_FORBIDDEN/);
 await db.exec('reset role');assert.equal((await db.query('select balance::float balance from treasuries where id=$1',[treasury.id])).rows[0].balance,110);
 assert.equal((await db.query('select quantity::float quantity from finished_products where id=1')).rows[0].quantity,8);
 await db.query('update auth.oauth_consents set revoked_at=now() where client_id=$1',[oauthClient]);await db.exec('set role factory_mcp_gateway');
 await assert.rejects(client.callTool({name:'factory_get_record',arguments:{resource:'sales_invoices',id:invoice.id}}),/403|MCP_ACCESS_FORBIDDEN/);
});
