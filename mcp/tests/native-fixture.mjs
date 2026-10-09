import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fixtureSql } from './fixture.mjs';
import { consentAndIssue } from './oauth-fixture.mjs';
const sql=name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
export async function initializeNativeDatabase(db){
 await db.exec(fixtureSql());
 const legacy=sql('20240127000001_atomic_orders.sql');
 for(const name of ['cancel_production_order_atomic','cancel_packaging_order_atomic']){
  const definition=legacy.match(new RegExp('CREATE OR REPLACE FUNCTION '+name+'\\([\\s\\S]*?\\$\\$;','i'))?.[0];
  assert.ok(definition);await db.exec(definition);
 }
 await db.exec(sql('20240114000013_fix_transfer_type.sql'));
 await db.exec(sql('20261009140827_comprehensive_mcp_operations.sql'));
 const mcpClaims=await consentAndIssue(db);
 await db.exec(sql('20261009161500_readonly_mcp_analytics.sql'));
 await db.exec(sql('20261009190000_native_mcp_compatibility.sql'));
 return mcpClaims;
}
