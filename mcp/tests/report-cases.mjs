// Supporting test draft only; root copies/reviews/runs it. No imports or external credentials.
// Fixtures insert already-posted historical records intentionally: these are report arithmetic tests,
// not posting-service tests. Each case rolls back through the caller's isolated transaction.
export function registerReportCases({test,assert,isolated,query,write,sql,value,actor,customer}) {
  const asOf='2026-10-09';
  const report=(name,extra={})=>query('report',{report:name,as_of:asOf,...extra});
  const near=(actual,expected)=>assert.ok(Math.abs(Number(actual)-expected)<1e-8,`expected ${expected}, received ${actual}`);
  const supplier='00000000-0000-4000-8000-000000000110';

  async function financialRows() {
    await sql("insert into parties(id,name,type) values($1,'Report supplier','supplier')",[supplier]);
    await sql("insert into treasuries(id,name,type,balance) values(100100,'Report safe','cash',0)");
    await sql("insert into financial_categories(id,name,type) values(100101,'report_fee','income') on conflict(name,type) do nothing");
    await sql(`insert into sales_invoices(id,invoice_number,customer_id,transaction_date,total_amount,paid_amount,status)
      values(100110,'REPORT-SALES',$1,'2026-10-08',1000,400,'posted'),
        (100111,'REPORT-DRAFT',$1,'2026-10-08',9000,9000,'draft')`,[customer]);
    await sql(`insert into sales_invoice_items(id,invoice_id,item_type,finished_product_id,quantity,unit_price,total_price,unit_cost_at_sale)
      values(100112,100110,'finished_product',1,10,100,1000,40),
        (100113,100111,'finished_product',1,90,100,9000,99)`);
    await sql(`insert into sales_returns(id,return_number,original_invoice_id,customer_id,return_date,total_amount,status)
      values(100114,'REPORT-RETURN',100110,$1,'2026-10-08',200,'posted')`,[customer]);
    await sql(`insert into sales_return_items(id,return_id,item_type,finished_product_id,quantity,unit_price,total_price,unit_cost_at_return)
      values(100115,100114,'finished_product',1,2,100,200,40)`);
    await sql(`insert into purchase_invoices(id,invoice_number,supplier_id,transaction_date,total_amount,paid_amount,status)
      values(100116,'REPORT-PURCHASE',$1,'2026-10-08',700,250,'posted')`,[supplier]);
    // Unconfigured financial category names must not affect PNL income/expenses.
    await sql(`insert into financial_transactions(id,treasury_id,amount,transaction_type,category,transaction_date)
      values(100120,100100,50,'income','report_fee','2026-10-08'),
        (100121,100100,100,'expense','rent','2026-10-08'),
        (100122,100100,300,'expense','payment','2026-10-08'),
        (100123,100100,75,'expense','transfer_out','2026-10-08'),
        (100124,100100,75,'income','transfer_in','2026-10-08')`);
  }

  test('report PNL nets posted returns, historical COGS and exact configured categories',()=>isolated(async()=>{
    await financialRows();
    const actual=await report('pnl',{start_date:'2026-10-01',end_date:asOf});
    for(const [key,expected] of Object.entries({sales_revenue:1000,returns_amount:200,manual_revenue:50,
      sales_cogs:400,return_cogs:80,revenue:850,cogs:320,gross_profit:530,expenses:100,net_profit:430})) {
      near(actual.summary[key],expected);
    }
    assert.equal(actual.total_count,1);
    assert.equal(actual.calculation_basis.complete_input_set,true);
    assert.match(actual.calculation_basis.returns,/historical|posted/);
  }));

  test('report cash flow matches source invoice-date paid totals and exposes overlap basis',()=>isolated(async()=>{
    await financialRows();
    const actual=await report('cash_flow',{start_date:'2026-10-01',end_date:asOf,limit:2});
    near(actual.summary.inflows,525); near(actual.summary.outflows,350); near(actual.summary.net,175);
    assert.equal(actual.total_count,9); assert.equal(actual.has_more,true);
    assert.match(actual.calculation_basis.cash_basis,/paid_amount/);
    assert.match(actual.calculation_basis.double_count_warning,/receipt|income/);
    const next=await report('cash_flow',{snapshot_id:actual.snapshot_id,offset:2,limit:2});
    assert.deepEqual(next.summary,actual.summary);
    // Source intentionally includes all income entries even when invoice-linked. The disclosed
    // result must change by400 instead of pretending this report is an actual payment-date ledger.
    await sql(`insert into financial_transactions(id,treasury_id,party_id,amount,transaction_type,category,transaction_date,invoice_id,invoice_type)
      values(100125,100100,$1,400,'income','receipt','2026-10-08',100110,'sales')`,[customer]);
    const after=await report('cash_flow',{start_date:'2026-10-01',end_date:asOf});
    near(after.summary.inflows,925); near(after.summary.net,575);
    const persisted=await report('cash_flow',{snapshot_id:actual.snapshot_id,offset:4,limit:2});
    near(persisted.summary.inflows,525);
  }));

  test('report aging buckets use exact 30/31/60/61/90/91 boundaries and party scope',()=>isolated(async()=>{
    await sql("insert into parties(id,name,type) values($1,'Aging supplier','supplier')",[supplier]);
    const ages=[30,31,60,61,90,91];
    for(let index=0;index<ages.length;index++) {
      const id=100200+index;
      const table=index<3?'sales_invoices':'purchase_invoices';
      const partyColumn=index<3?'customer_id':'supplier_id';
      // table/column strings here are fixed test-owned constants, not user inputs.
      await sql(`insert into ${table}(id,invoice_number,${partyColumn},transaction_date,total_amount,paid_amount,status)
        values($1,$2,$3,$4::date-$5::int,$6,5,'posted')`,
        [id,`AGE-${id}`,index<3?customer:supplier,asOf,ages[index],(index+1)*10+5]);
    }
    await sql(`insert into sales_invoices(id,invoice_number,customer_id,transaction_date,total_amount,paid_amount,status)
      values(100210,'AGE-PAID',$1,'2026-10-01',10,10,'posted'),
        (100211,'AGE-OVERPAID',$1,'2026-10-01',10,15,'posted'),
        (100212,'AGE-DRAFT',$1,'2026-10-01',999,0,'draft')`,[customer]);
    const actual=await report('aging',{limit:250});
    assert.equal(actual.total_count,6); near(actual.summary.amount,210);
    const buckets=Object.fromEntries(actual.summary.group_totals.map(group=>[group.group_key,Number(group.amount)]));
    assert.deepEqual(buckets,{'0-30':10,'31-60':50,'61-90':90,'90+':60});
    assert.deepEqual(actual.rows.map(row=>Number(row.age_days)).sort((a,b)=>a-b),ages);
    const customerOnly=await report('aging',{party_type:'customer'});
    near(customerOnly.summary.amount,60); assert.equal(customerOnly.total_count,3);
    const supplierOnly=await report('aging',{party_id:supplier});
    near(supplierOnly.summary.amount,150); assert.equal(supplierOnly.total_count,3);
  }));

  test('report pricing uses current component cost rather than bundle WACO and sales-price denominator',()=>isolated(async()=>{
    await sql(`insert into raw_materials(id,code,name,unit,quantity,unit_cost,sales_price)
      values(100300,'RPRICE','FixturePrice raw','kg',10,2,4)`);
    await sql(`insert into finished_products(id,code,name,unit,quantity,unit_cost,sales_price)
      values(100301,'FPRICE','FixturePrice finished','unit',2,6,10)`);
    await sql(`insert into product_bundles(id,code,name,quantity,unit_cost,bundle_price,is_active)
      values(100302,'BPRICE','FixturePrice bundle',1,999,20,true)`);
    await sql(`insert into bundle_items(id,bundle_id,item_type,finished_product_id,raw_material_id,quantity)
      values(100303,100302,'finished_product',100301,null,2),
        (100304,100302,'raw_material',null,100300,1)`);
    // Preserve the intentionally distinct historical stock cost after any native recipe trigger.
    await sql('update product_bundles set unit_cost=999 where id=100302');
    const actual=await report('pricing_analysis',{search:'FixturePrice',target_margin:25,limit:250});
    assert.equal(actual.total_count,3);
    const byKind=Object.fromEntries(actual.rows.map(row=>[row.kind,row]));
    near(byKind.finished_product.total_cost,6); near(byKind.finished_product.margin,40);
    near(byKind.finished_product.suggested_price,8);
    near(byKind.raw_material.margin,50); near(byKind.raw_material.suggested_price,2/.75);
    near(byKind.bundle.total_cost,14); near(byKind.bundle.margin,30); near(byKind.bundle.suggested_price,14/.75);
    const inventory=await report('inventory_analytics',{search:'FixturePrice',item_type:'finished_product'});
    near(inventory.rows[0].margin,100*4/6); // inventory analytics uses cost-value denominator
  }));

  test('report decision support preserves executive gross-sale formula and nonempty alerts and coverage',()=>isolated(async()=>{
    const negativeCustomer='00000000-0000-4000-8000-000000000401';
    const positiveSupplier='00000000-0000-4000-8000-000000000402';
    await sql('update parties set balance=100 where id=$1',[customer]);
    await sql(`insert into parties(id,name,type,balance) values($1,'Decision supplier','supplier',-80),
      ($2,'Overpaid customer','customer',-10),($3,'Overpaid supplier','supplier',20)`,[supplier,negativeCustomer,positiveSupplier]);
    await sql("insert into treasuries(id,name,type,balance) values(100400,'Positive cash','cash',300),(100401,'Negative cash','cash',-20)");
    // Suppress the baseline fixture's stock-only stale product to make alert evidence exact.
    await sql('update finished_products set quantity=0 where id<100000');
    await sql(`insert into raw_materials(id,code,name,unit,quantity,min_stock,unit_cost)
      values(100402,'DEC-RAW','Coverage raw','kg',6,10,2)`);
    await sql(`insert into packaging_materials(id,code,name,unit,quantity,min_stock,unit_cost)
      values(100403,'DEC-PKG','Empty packaging','unit',0,2,1)`);
    await sql(`insert into finished_products(id,code,name,unit,quantity,unit_cost,sales_price)
      values(100404,'DEC-FIN','Stagnant healthy-margin finished','unit',3,8,10)`);
    await sql(`insert into inventory_movements(id,item_id,item_type,movement_type,quantity,created_at)
      values(100405,100402,'raw_materials','out',30,'2026-09-20T12:00:00Z')`);
    await sql(`insert into production_orders(id,code,date,status,total_cost)
      values(100406,'DEC-PROD','2026-10-01','pending',50)`);
    await sql(`insert into packaging_orders(id,code,date,status,total_cost)
      values(100407,'DEC-PACK','2026-10-06','pending',30)`);
    await sql(`insert into sales_invoices(id,invoice_number,customer_id,transaction_date,total_amount,paid_amount,status)
      values(100408,'DEC-CURRENT',$1,'2026-10-08',1000,1000,'posted'),
        (100409,'DEC-PREVIOUS',$1,'2026-09-01',500,500,'posted')`,[customer]);
    await sql(`insert into sales_invoice_items(id,invoice_id,item_type,finished_product_id,quantity,unit_price,total_price,unit_cost_at_sale)
      values(100410,100408,'finished_product',100404,10,100,1000,40),
        (100411,100409,'finished_product',100404,5,100,500,30)`);
    const actual=await report('decision_support',{limit:250});
    for(const [key,expected] of Object.entries({treasury_balance:280,receivables:100,payables:80,net_cash:300,
      pending_production:1,pending_packaging:1,production_value:50,packaging_value:30,oldest_pending_days:8,
      revenue30d:1000,cogs30d:400,gross_margin:600,gross_margin_percent:60,
      previous_revenue30d:500,previous_cogs30d:150,revenue_change:100,margin_change:-10})) near(actual.summary[key],expected);
    const coverage=actual.rows.find(row=>row.section==='coverage'&&Number(row.id)===100402);
    assert.ok(coverage); near(coverage.avg_daily_usage,1); near(coverage.days_left,6); assert.equal(coverage.status,'critical');
    const alerts=Object.fromEntries(actual.rows.filter(row=>row.section==='alert').map(row=>[row.id,row]));
    assert.deepEqual(Object.keys(alerts).sort(),['low-stock-raw','low-stock-pkg','pending-production','negative-treasury','supplier-payables','stagnant-inventory'].sort());
    assert.equal(alerts['negative-treasury'].severity,'critical');
    assert.equal(alerts['low-stock-raw'].severity,'warning');
    near(alerts['stagnant-inventory'].value,1);
    const product=actual.rows.find(row=>row.section==='profitability_products'&&Number(row.id)===100404);
    assert.ok(product); near(product.revenue,1000); near(product.margin,600);
  }));

  test('report production efficiency includes every selected order and type',()=>isolated(async()=>{
    await sql(`insert into production_orders(id,code,date,status,total_cost) values
      (100500,'EFF-1','2026-10-08','completed',100),(100501,'EFF-2','2026-10-08','pending',20),
      (100502,'EFF-3','2026-10-08','inProgress',30)`);
    await sql(`insert into packaging_orders(id,code,date,status,total_cost) values
      (100503,'EFF-4','2026-10-08','completed',40),(100504,'EFF-5','2026-10-08','cancelled',10)`);
    const actual=await report('production',{start_date:'2026-10-08',end_date:asOf,limit:2});
    for(const [key,expected] of Object.entries({total:5,completed:2,pending:1,in_progress:1,cancelled:1,efficiency_rate:40,total_cost:200})) near(actual.summary[key],expected);
    assert.equal(actual.total_count,5); assert.equal(actual.has_more,true);
    const next=await report('production',{snapshot_id:actual.snapshot_id,offset:2,limit:2});
    assert.deepEqual(next.summary,actual.summary);
    assert.equal(new Set([...actual.rows,...next.rows].map(row=>row.row_key)).size,4);
  }));
}
