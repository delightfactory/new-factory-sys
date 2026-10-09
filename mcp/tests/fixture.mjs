import { readFileSync } from 'node:fs';

export const actor = '00000000-0000-4000-8000-000000000001';
export const customer = '00000000-0000-4000-8000-000000000002';
export const session = '00000000-0000-4000-8000-000000000003';
export const resource = 'https://factory.example/api/mcp';
const repository = new URL('../../', import.meta.url);
export function fixtureSql() {
  const statements = [`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.role() returns text language sql as $$ select auth.jwt()->>'role' $$;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;`,
    readFileSync(new URL('supabase/full_schema.sql', repository), 'utf8')];
  for (const migration of [
    '20240105000000_recipe_batch_size.sql','20240113000000_stocktaking_schema.sql','20240114000000_commercial_schema.sql',
    '20240114000002_invoices_schema.sql','20240114000004_fix_missing_columns.sql',
    '20240114000007_financial_returns.sql','20240114000009_clean_financial_functions.sql',
    '20240114000010_financial_pnl.sql','20240114000011_financial_categories.sql','20240115000000_dynamic_cost_updates.sql','20240120000000_user_management.sql','20240124000000_audit_system.sql',
    '20240126000000_comprehensive_inventory_tracking.sql','20251216000000_create_ledger_view.sql',
    '20260105000010_void_returns_functions.sql','20260105000020_fix_sales_return_cogs.sql',
    '20260105000030_unified_purchase_invoice.sql','20260106000000_disable_cost_propagation_triggers.sql','20260130000000_product_bundles.sql',
    '20261009130620_remote_mcp_foundation.sql',
  ]) {
    if (migration === '20261009130620_remote_mcp_foundation.sql') statements.push(
      'grant select,insert,update,delete on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated;');
    statements.push(readFileSync(new URL(`supabase/migrations/${migration}`,repository),'utf8'));
  }
  statements.push(`insert into auth.users(id)values('${actor}');
    update profiles set role='admin' where id='${actor}';
    insert into auth.sessions(id,user_id)values('${session}','${actor}');
    insert into factory_private.mcp_access(user_id,client_id,resource,can_write,expires_at)
      values('${actor}','test-client','${resource}',true,now()+interval '1 day');
    insert into parties(id,name,type)values('${customer}','Test customer','customer');
    insert into raw_materials(code,name,unit,quantity,unit_cost)values('RM1','Raw','kg',100,2);
    insert into packaging_materials(code,name,unit,quantity,unit_cost)values('PM1','Bottle','unit',100,1);
    insert into semi_finished_products(code,name,unit,quantity,unit_cost,recipe_batch_size)values('SF1','Mix','kg',10,4,10);
    insert into semi_finished_ingredients(semi_finished_id,raw_material_id,percentage,quantity)values(1,1,100,10);
    insert into finished_products(code,name,unit,quantity,unit_cost,semi_finished_id,semi_finished_quantity)
      values('FP1','Finished','unit',10,5,1,2);
    insert into finished_product_packaging(finished_product_id,packaging_material_id,quantity)values(1,1,1);
    -- Historical stock costs deliberately differ from the current recipe.
    update semi_finished_products set unit_cost=4 where id=1;
    update finished_products set unit_cost=5 where id=1;`);
  return statements.join('\n');
}
