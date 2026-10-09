import { z } from 'zod';

export const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const uuid = z.string().uuid();
export const quantity = z.number().positive().max(1e9);
export const money = z.number().nonnegative().max(1e12);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string().trim().min(1).max(200);
const notes = z.string().max(2000).optional();
const base = { request_id: uuid };
const dated = { ...base, date, notes };
const itemTypes = ['raw_material','packaging_material','semi_finished','finished_product','bundle'];
const line = z.object({ item_type:z.enum(itemTypes),item_id:id,quantity,unit_price:money }).strict();
const invoice = { ...dated,items:z.array(line).min(1).max(500),treasury_id:id.optional(),paid_amount:money.optional(),
  tax_amount:money.optional(),discount_amount:money.optional(),shipping_cost:money.optional(),invoice_number:text.optional() };
const stock = {code:text.optional(),name:text,unit:text,quantity:money.optional(),min_stock:money.optional(),
  unit_cost:money.optional(),sales_price:money.optional()};
const inventoryKinds=['raw_materials','packaging_materials','semi_finished_products','finished_products','product_bundles'];
export const resources=[...inventoryKinds,'parties','treasuries','financial_categories','financial_transactions',
  'sales_invoices','purchase_invoices','sales_returns','purchase_returns','production_orders','packaging_orders',
  'bundle_assembly_orders','inventory_count_sessions','inventory_movements','profiles','audit_logs'];
export const reports=['dashboard','pnl','balance_sheet','cash_flow','aging','inventory','inventory_analytics','low_stock',
  'turnover','production','product_performance','decision_support','party_analysis','expense_analysis','cost_card',
  'pricing_analysis','trends','product_journey'];
const page={snapshot_id:uuid.optional(),offset:z.number().int().nonnegative().max(1e9).optional(),limit:z.number().int().min(1).max(250).optional(),
  search:z.string().max(100).optional(),start_date:date.optional(),end_date:date.optional(),status:text.optional(),
  party_id:uuid.optional(),item_type:z.enum(itemTypes).optional(),item_id:id.optional(),parent_id:id.optional()};
const recipe=z.array(z.object({raw_material_id:id,quantity,percentage:money.optional()}).strict()).max(500);
const packaging=z.array(z.object({packaging_material_id:id,quantity}).strict()).max(500);
const components=z.array(z.object({item_type:z.enum(itemTypes.slice(0,4)),item_id:id,quantity}).strict()).min(1).max(500);
const masters={
  raw_material:{...stock,importance:z.number().int().min(0).max(100).optional()},packaging_material:stock,
  semi_finished_product:{...stock,recipe_batch_size:quantity,ingredients:recipe},
  finished_product:{...stock,semi_finished_id:id.nullable().optional(),semi_finished_quantity:quantity.optional(),packaging},
  bundle:{code:text.optional(),name:text,description:notes,min_stock:money.optional(),bundle_price:money,is_active:z.boolean().optional(),items:components},
  party:{name:text,type:z.enum(['customer','supplier']),phone:z.string().max(100).optional(),email:z.string().email().optional(),address:notes,
    tax_number:text.optional(),commercial_record:text.optional(),credit_limit:money.optional(),opening_balance:z.number().min(-1e12).max(1e12).optional()},
  treasury:{name:text,type:z.enum(['cash','bank']),currency:text.optional(),account_number:text.optional(),description:notes,opening_balance:money.optional()},
  financial_category:{name:text,type:z.enum(['income','expense'])},
};
export const writes={};
for(const [kind,shape] of Object.entries(masters)) {
  writes[`create_${kind}`]={schema:{...base,...shape},description:`Create ${kind} and its recipe/components atomically. Opening quantities/balances are recorded; derived costs remain system-owned.`};
  const updateShape=Object.fromEntries(Object.entries(shape).filter(([key])=>!['quantity','unit_cost','opening_balance'].includes(key)).map(([key,value])=>[key,value.optional()]));
  writes[`update_${kind}`]={schema:{...base,id:kind==='party'?uuid:id,...updateShape},description:`Update ${kind} metadata and optional complete replacement recipe/components atomically.`};
}

for(const kind of ['raw_material','packaging_material','semi_finished_product','finished_product']) {
 const fields=Object.fromEntries(Object.entries(masters[kind]).filter(([key])=>!['quantity','unit_cost'].includes(key)).map(([key,value])=>[key,value.optional()]));
 writes[`edit_${kind}`]={schema:{...base,id,...fields,quantity:money.optional(),...(['raw_material','packaging_material'].includes(kind)?{unit_cost:money.optional()}:{}),reason:z.string().trim().min(1).max(2000)},description:`Edit ${kind} metadata/recipe and optional stock adjustment atomically, matching the native edit form. Explicit reason required. Semi-finished and finished historical unit costs remain system-owned.`};
}
writes.create_sales_invoice={schema:{...invoice,customer_id:uuid,
  items:z.array(z.union([line,z.object({finished_product_id:id,quantity,unit_price:money}).strict()])).min(1).max(500)},description:'Create a draft sales invoice for any supported sales item type, including bundles. Server totals; optional paid amount is recorded when posted.'};
writes.create_purchase_invoice={schema:{...invoice,supplier_id:uuid,items:z.array(line.refine(x=>x.item_type!=='bundle','Purchasing bundles is not supported by the app')).min(1).max(500)},description:'Create draft purchase invoice. Posting applies proportional cost distribution and weighted average cost.'};
for(const kind of ['sales','purchase']) {
  writes[`create_${kind}_return`]={schema:{...dated,[kind==='sales'?'customer_id':'supplier_id']:uuid,original_invoice_id:id.optional(),
    items:z.array(line.refine(x=>kind==='sales'||x.item_type!=='bundle')).min(1).max(500)},description:`Create draft ${kind} return; linked partial returns are validated against the original invoice and already posted returns.`};
  for(const verb of ['post','void']) for(const document of ['invoice','return']) writes[`${verb}_${kind}_${document}`]={
    schema:{...base,id},description:`${verb} ${kind} ${document} with locked state transition, stock/ledger effects and retry safety. This records business accounting inside the factory system.`};
}
writes.fulfill_packaging_order={schema:{...base,id},description:'Complete packaging and create/complete only the required semi-finished shortage production in one transaction. Returns operation numbers and actual costs. Any shortage failure rolls back all phases.'};
for(const kind of ['production','packaging','bundle_assembly']) {
  const itemKey=kind==='production'?'semi_finished_id':kind==='packaging'?'finished_product_id':'bundle_id';
  writes[`create_${kind}_order`]={schema:{...dated,items:z.array(z.object({[itemKey]:id,quantity}).strict()).min(1).max(kind==='bundle_assembly'?500:100)},description:`Create pending ${kind} order with current recipe cost estimate.`};
  for(const verb of ['start','complete','cancel']) writes[`${verb}_${kind}_order`]={schema:{...base,id},description:`${verb} ${kind} order. Cancellation of completed production/packaging reverses recorded execution effects; completed bundle assembly reversal is not supported by the existing app.`};
}
writes.record_financial_transaction={schema:{...base,treasury_id:id,amount:quantity,type:z.enum(['income','expense']),category:text,
  description:notes,date:date.optional(),party_id:uuid.optional(),invoice_id:id.optional(),invoice_type:z.enum(['purchase','sales']).optional()},
  description:'Record a receipt/payment/manual income or expense in the system; optionally settle a matching invoice. No real bank transfer or money movement outside the system.'};
writes.transfer_treasury={schema:{...base,from_id:id,to_id:id,amount:quantity,description:notes},description:'Record a ledger transfer between existing treasuries. This does not perform a real bank transfer.'};
writes.create_stocktake={schema:{...dated,type:z.enum(['full','partial'])},description:'Create draft stocktaking session.'};
writes.start_stocktake={schema:{...base,id,raw:z.boolean(),packaging:z.boolean(),semi:z.boolean(),finished:z.boolean()},description:'Start stocktake and snapshot selected inventory types once. Counts initially equal snapshot quantities.'};
writes.record_stocktake_counts={schema:{...base,id,counts:z.array(z.object({item_id:id,counted_quantity:money}).strict()).min(1).max(500)},description:'Record counted quantities belonging to this open stocktake.'};
for(const verb of ['reconcile','cancel'])writes[`${verb}_stocktake`]={schema:{...base,id},description:`${verb} stocktake once. Reconciliation applies counted-minus-snapshot to current stock without overwriting later movements.`};
writes.adjust_inventory={schema:{...base,item_type:z.enum(itemTypes.slice(0,4)),item_id:id,quantity:money,unit_cost:money.optional(),reason:text},description:'Record the inventory adjustment available in master-item editing. Log before/after stock and optional explicitly chosen adjustment cost.'};
writes.rename_user={schema:{...base,user_id:uuid,name:text},description:'Admin: update an existing user display name; no role, active status or credential change.'};

export const reads={
  list_records:{schema:{resource:z.enum(resources),...page},description:'Browse a fixed supported business resource with full count, totals, stable pagination and data timestamp. Never an arbitrary table query.'},
  get_record:{schema:{resource:z.enum(resources),id:z.union([id,uuid]),...page},description:'Read supported record header and paged recipe/document/count lines, with totals and links.'},
  report:{schema:{report:z.enum(reports),...page,snapshot_id:uuid.optional(),as_of:date.optional(),party_type:z.enum(['customer','supplier','all']).optional(),
    period:z.enum(['7','30','90','180','365']).optional(),target_margin:z.number().min(0).max(99).optional(),include_payments:z.boolean().optional(),include_transfers:z.boolean().optional(),
    sort_by:z.enum(['name','date','quantity','value','revenue','margin','amount','age_days','turnover','total_cost']).optional(),descending:z.boolean().optional()},
    description:'Open or continue a complete named report snapshot. Summary covers all filtered records, not just this page. Continue with snapshot_id until has_more=false; as_of and calculation basis are explicit.'},
  party_statement:{schema:{...page,party_id:uuid},description:'Full party ledger with opening/closing balances, debit/credit totals and stable paged entries.'},
  treasury_statement:{schema:{treasury_id:id,...page,snapshot_id:uuid.optional()},description:'Full treasury ledger including both transfer sides; opening/closing balances and complete period totals.'},
  stock_requirements:{schema:{kind:z.enum(['semi_finished','finished_product','bundle','packaging_order']),id,quantity:quantity.optional()},description:'Calculate required components, available stock, pending demand, shortages and suggested production before execution.'},
  list_users:{schema:page,description:'Admin-only existing users/profile details without authentication secrets.'},
  backup_manifest:{schema:{},description:'Admin: capture one coherent full business backup snapshot and return its ID, table manifest and complete counts; excludes users/auth/credentials. Export every table using this same snapshot_id.'},
  backup_export:{schema:{table:z.enum([...resources.filter(x=>!['profiles','audit_logs'].includes(x)),'semi_finished_ingredients','finished_product_packaging','bundle_items','sales_invoice_items','purchase_invoice_items','sales_return_items','purchase_return_items','production_order_items','production_order_consumed_materials','packaging_order_items','packaging_order_consumed_materials','bundle_assembly_order_items','inventory_count_items']),snapshot_id:uuid,offset:page.offset,limit:page.limit},description:'Admin: export a table from the coherent backup_manifest snapshot, following all pages. Not a cloud URL or credential export.'},
  protected_handoff:{schema:{action:z.enum(['create_user','change_user_role','change_user_status','reset_password','delete_user','delete_record','delete_financial_transaction','download_cloud_backup','restore_backup','factory_reset']),
    user_id:uuid.optional(),resource:z.enum(resources).optional(),record_id:z.union([id,uuid]).optional()},description:'Prepare a protected handoff to the existing signed-in admin/UI workflow. Return exact target/action and required approval; never execute it or accept a password.'},
};

export function normalizeWrite(action,args) {
  const {request_id:requestId,...payload}=args;
  if(action==='create_sales_invoice') payload.items=payload.items.map(item=>item.item_type?item:
    {item_type:'finished_product',item_id:item.finished_product_id,quantity:item.quantity,unit_price:item.unit_price});
  return {action,payload,requestId};
}
