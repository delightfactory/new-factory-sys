// Declarative synthetic cases. No execution occurs on import. Root supplies real local fixture,
// OAuth claims/admission/consent and repeatable-read read-only runner. Never use a hosted database.
const field=(alias,column)=>({alias,column});
const col=(alias,column)=>({kind:'column',field:field(alias,column)});
const agg=(fn,expr)=>({kind:'aggregate',fn,...(expr?{expr}:{})});
export const cases=[
 {name:'complete stock value aggregation precedes pagination',setupSql:[
   `INSERT INTO raw_materials(id,code,name,unit,quantity,unit_cost) VALUES
    (200001,'AN1','Analytical A','kg',5,2),(200002,'AN2','Analytical B','kg',8,3)`],
  query:{from:{table:'raw_materials',alias:'a0'},select:[{as:'total_value',expr:agg('sum',{kind:'product',left:field('a0','quantity'),right:field('a0','unit_cost')})}],
   filters:[{field:field('a0','id'),op:'in',value:[200001,200002]}],limit:1},expected:{rows:[{total_value:34}],total_count:1,has_more:false,aggregation_complete:true}},
 {name:'linked invoice customer and items, grouped historical COGS',setupSql:[
   `INSERT INTO parties(id,name,type) VALUES('00000000-0000-4000-8000-000000200001','Analytical customer','customer')`,
   `INSERT INTO sales_invoices(id,invoice_number,customer_id,transaction_date,total_amount,status)
     VALUES(200010,'AN-SI','00000000-0000-4000-8000-000000200001','2026-10-09',100,'posted')`,
   `INSERT INTO sales_invoice_items(id,invoice_id,item_type,finished_product_id,quantity,unit_price,total_price,unit_cost_at_sale)
     VALUES(200011,200010,'finished_product',1,2,20,40,7),(200012,200010,'finished_product',1,3,20,60,8)`],
  query:{from:{table:'sales_invoices',alias:'a0'},joins:[
   {relationship:'sales_invoices.customer_id',from_alias:'a0',alias:'a1',type:'inner'},
   {relationship:'sales_invoice_items.invoice_id',from_alias:'a0',alias:'a2',type:'inner'}],
   select:[{as:'customer',expr:col('a1','name')},{as:'sold_units',expr:agg('sum',col('a2','quantity'))},
    {as:'cogs',expr:agg('sum',{kind:'product',left:field('a2','quantity'),right:field('a2','unit_cost_at_sale')})}],
   group_by:['customer'],filters:[{field:field('a0','id'),op:'eq',value:200010}],limit:1},
  expected:{rows:[{customer:'Analytical customer',sold_units:5,cogs:38}],total_count:1,has_more:false}},
 {name:'grouping output count and sum are complete; row limit has lookahead',setupSql:[
   `INSERT INTO raw_materials(id,code,name,unit,quantity,unit_cost) VALUES
     (200020,'AG1','Group C','kg',30,1),(200021,'AG2','Group B','kg',20,1),(200022,'AG3','Group A','kg',10,1)`],
  query:{from:{table:'raw_materials',alias:'a0'},select:[{as:'name',expr:col('a0','name')},{as:'stock',expr:agg('sum',col('a0','quantity'))}],
   group_by:['name'],filters:[{field:field('a0','id'),op:'between',value:[200020,200022]}],order_by:[{as:'stock',direction:'desc'}],offset:0,limit:2},
  expected:{rows:[{name:'Group C',stock:30},{name:'Group B',stock:20}],total_count:3,has_more:true,truncated:true,next_offset:2}},
 {name:'numeric product does not accept text columns',query:{from:{table:'parties',alias:'a0'},select:[{as:'bad',expr:{kind:'product',left:field('a0','name'),right:field('a0','balance')}}]},error:'MCP_ANALYTICS_PRODUCT_INVALID'},
 {name:'one-to-many header amount explicitly preserves join multiplicity',reuse:'linked invoice customer and items, grouped historical COGS',
  query:{from:{table:'sales_invoices',alias:'a0'},joins:[{relationship:'sales_invoice_items.invoice_id',from_alias:'a0',alias:'a1',type:'inner'}],
   select:[{as:'header_sum',expr:agg('sum',col('a0','total_amount'))}],filters:[{field:field('a0','id'),op:'eq',value:200010}]},expected:{rows:[{header_sum:200}]}},
 {name:'bound textual SQL-looking value is data, never execution',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a0','name')}],
   filters:[{field:field('a0','name'),op:'eq',value:"'; UPDATE parties SET balance=0; --"}]},expected:{rows:[],total_count:0,has_more:false}},
 {name:'auth table blocked',query:{from:{table:'auth.users',alias:'a0'},select:[{as:'id',expr:col('a0','id')}]},error:'MCP_ANALYTICS_TABLE_FORBIDDEN'},
 {name:'unsafe ledger view blocked',query:{from:{table:'ledger_entries',alias:'a0'},select:[{as:'id',expr:col('a0','id')}]},error:'MCP_ANALYTICS_TABLE_FORBIDDEN'},
 {name:'profile credentials/admin metadata blocked',query:{from:{table:'profiles',alias:'a0'},select:[{as:'id',expr:col('a0','id')}]},error:'MCP_ANALYTICS_TABLE_FORBIDDEN'},
 {name:'arbitrary secret column blocked',query:{from:{table:'treasuries',alias:'a0'},select:[{as:'secret',expr:col('a0','account_number')}]},error:'MCP_ANALYTICS_FIELD_FORBIDDEN'},
 {name:'unknown top-level sql key blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a0','name')}],sql:'SELECT * FROM auth.users'},error:'MCP_ANALYTICS_INPUT_INVALID'},
 {name:'arbitrary function blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'bad',expr:{kind:'aggregate',fn:'pg_sleep',expr:col('a0','balance')}}]},error:'MCP_ANALYTICS_AGGREGATE_INVALID'},
 {name:'join raw predicate blocked',query:{from:{table:'parties',alias:'a0'},joins:[{relationship:'sales_invoices.customer_id',from_alias:'a0',alias:'a1',type:'inner',on:'TRUE'}],select:[{as:'name',expr:col('a0','name')}]},error:'MCP_ANALYTICS_INPUT_INVALID'},
 {name:'unrelated relationship blocked',query:{from:{table:'parties',alias:'a0'},joins:[{relationship:'production_order_items.production_order_id',from_alias:'a0',alias:'a1',type:'inner'}],select:[{as:'name',expr:col('a0','name')}]},error:'MCP_ANALYTICS_JOIN_INVALID'},
 {name:'unregistered alias blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a1','name')}]},error:'MCP_ANALYTICS_FIELD_FORBIDDEN'},
 {name:'unregistered order alias blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a0','name')}],order_by:[{as:'other',direction:'asc'}]},error:'MCP_ANALYTICS_ORDER_INVALID'},
 {name:'ungrouped mixed column/aggregate blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a0','name')},{as:'amount',expr:agg('sum',col('a0','balance'))}]},error:'MCP_ANALYTICS_GROUP_INVALID'},
 {name:'unbounded result page blocked',query:{from:{table:'parties',alias:'a0'},select:[{as:'name',expr:col('a0','name')}],limit:251},error:'MCP_ANALYTICS_INPUT_INVALID'}
];
// Additional integration gates requiring supplied role/session fixtures (not performed here):
export const securityGates=[
 'Use two synthetic parties and a temporary test-only restrictive SELECT policy TO authenticated USING(id=auth.uid()); analyze returns only permitted row even admin profile. Restore fixture after test.',
 'A joined table restrictive policy must independently hide its rows; inner vs left join must obey native SQL RLS semantics.',
 'Inventory-officer select or join finance table denied before SELECT; accountant production table denied; schema discovery omits denied tables.',
 'Current authenticated role must be NOSUPERUSER/NOBYPASSRLS and not a member of selected table owner; public analyzer ownership remains authenticated.',
 'PUBLIC/anon/authenticated cannot call public analyzer/schema; factory_mcp_gateway can. Actual SELECT executes authenticated, not postgres.',
 'READ WRITE or wrong isolation analyzer invocation denied; READ ONLY REPEATABLE READ works without FOR SHARE, INSERT or sequence usage.',
 'Live OAuth consent/session/client/admission/access expiry/revocation and fingerprint changes deny next request. JWT role remains authenticated only in trusted gateway-local translation, with original sub/session/client/aud/scope intact.',
 'Ordinary business writes and generic raw SQL remain inaccessible through analyzer even if a query contains nested sql/functions/select/on keys.',
 'Default RLS with no SELECT policy returns no rows; no grants/policy expansion is performed to repair this.',
 'A deliberately missing source column raises a sanitized error, never silently grants wider schema access.'
];
