-- Revert only this reviewed profit wrapper; no data/snapshot changes.

BEGIN;

DO $guard$ BEGIN

 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_legacy_context(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='945c267ebdd56e799725d736a16743f7' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_legacy_context(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_totals(jsonb)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='afd072899bf9c0fc49db43d59e1934e1' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='i' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_totals(jsonb)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_days(date,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='8fbcee5d35954f14c7b7d36505bff46c' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_days(date,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_cash_values(jsonb,jsonb)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='82a7a4c9c29316b7d43794c60b6e526e' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='i' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_cash_values(jsonb,jsonb)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='343c63ebb71cbe477395fb9912da16a2' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build_before_profit_ledger(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='ca6297d81e65595fa67e2db3d950f696' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build_before_profit_ledger(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build_before_cash_ledger(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='d357428c9a32ff78880712754272a646' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build_before_cash_ledger(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_cash_ledger(jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='1b9875129e279a876e875aa262aaa540' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_cash_ledger(jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_pnl(date,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='733c53418f7a54d26df95f437909bb65' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_pnl(date,date)';END IF;

END $guard$;

-- Restore the exact captured legacy dispatcher before removing the profit wrapper.
CREATE OR REPLACE FUNCTION factory_private.report_build_before_cash_ledger(p_report text, p_filters jsonb, p_asof date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rows jsonb:='[]'; summary jsonb:='{}'; basis jsonb; extra jsonb;
  ds date:=coalesce((p_filters->>'start_date')::date,p_asof-(coalesce((p_filters->>'period')::int,30)-1));
  de date:=coalesce((p_filters->>'end_date')::date,p_asof);
  target numeric:=coalesce((p_filters->>'target_margin')::numeric,25);
  fp_id bigint:=(p_filters->>'item_id')::bigint;
BEGIN
 IF ds>de OR de>p_asof OR target<0 OR target>=100 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 basis:=jsonb_build_object('source','current application report formulas','start_date',ds,'end_date',de,
   'as_of',p_asof,'current_balances',false,'currency','EGP','complete_input_set',true);
 IF p_report IN ('inventory','inventory_analytics','low_stock','turnover','pricing_analysis','product_performance') THEN
   basis:=basis||jsonb_build_object('current_balances',true,'as_of_meaning','movement/date cutoff; inventory quantity/cost/price are current at captured_at, not historical');
   WITH base AS (SELECT i.*,quantity*unit_cost value,
     (sales_price-unit_cost)*quantity potential_profit,
     CASE WHEN p_report='inventory_analytics' THEN
       CASE WHEN quantity*unit_cost>0 THEN (sales_price-unit_cost)*quantity/(quantity*unit_cost)*100 ELSE 0 END
       ELSE CASE WHEN sales_price>0 THEN (sales_price-unit_cost)/sales_price*100 ELSE 0 END END margin,
     coalesce((SELECT sum(m.quantity) FROM inventory_movements m WHERE m.item_id=i.id AND m.item_type::text=i.movement_kind
       AND m.movement_type='out' AND m.created_at>=p_asof-90 AND m.created_at<p_asof+1),0) consumed,
     coalesce((SELECT sum(l.quantity) FROM sales_invoice_items l JOIN sales_invoices h ON h.id=l.invoice_id
       WHERE l.finished_product_id=i.id AND i.kind='finished_product' AND h.status='posted' AND h.transaction_date<=p_asof),0) sold,
     coalesce((SELECT sum(l.quantity*l.unit_price) FROM sales_invoice_items l JOIN sales_invoices h ON h.id=l.invoice_id
       WHERE l.finished_product_id=i.id AND i.kind='finished_product' AND h.status='posted' AND h.transaction_date<=p_asof),0) revenue,
     CASE WHEN i.kind='bundle' THEN factory_private.report_bundle_cost(i.id) ELSE i.unit_cost END price_cost
     FROM factory_private.report_inventory() i WHERE (i.kind<>'bundle' OR i.active)
       AND (NOT p_filters?'item_type' OR i.kind=p_filters->>'item_type')
       AND (NOT p_filters?'item_id' OR i.id=fp_id)
       AND (NOT p_filters?'search' OR i.name ILIKE '%'||(p_filters->>'search')||'%' OR i.code ILIKE '%'||(p_filters->>'search')||'%')
   ), filtered AS (SELECT * FROM base WHERE
      (p_report<>'low_stock' OR min_stock>0 AND quantity<=min_stock)
      AND (p_report<>'turnover' OR kind<>'bundle')
      AND (p_report<>'product_performance' OR kind IN ('finished_product','bundle'))
      AND (p_report<>'pricing_analysis' OR kind IN ('finished_product','bundle') OR kind='raw_material' AND sales_price>0)
   ), valued AS(SELECT *,sum(value) OVER() full_value,sum(value) OVER(ORDER BY value DESC,kind,id) cumulative FROM filtered)
   SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object(
     'row_key',kind||':'||id,'total_cost',price_cost,'amount',value,
     'stock_level',CASE WHEN min_stock>0 THEN round(quantity/min_stock*100) ELSE NULL END,
     'deficit',greatest(0,min_stock-quantity),'urgency',CASE WHEN quantity=0 THEN 'critical' WHEN quantity<=min_stock THEN 'warning' ELSE 'ok' END,
     'turnover',CASE WHEN quantity+consumed/2>0 THEN round(consumed/(quantity+consumed/2)*4,2) ELSE 0 END,
     'days_on_hand',CASE WHEN consumed>0 THEN round(quantity/(consumed/90)) ELSE 999 END,
     'margin_amount',sales_price-price_cost,'margin_percent',CASE WHEN sales_price>0 THEN (sales_price-price_cost)/sales_price*100 ELSE 0 END,
     'margin',CASE WHEN p_report IN('pricing_analysis','product_performance') THEN CASE WHEN sales_price>0 THEN (sales_price-price_cost)/sales_price*100 ELSE 0 END ELSE margin END,
     'suggested_price',price_cost/(1-target/100),'suggested_price25',price_cost/.75,'suggested_price30',price_cost/.70,
     'potential_revenue',sales_price*quantity,
     'abc',CASE WHEN full_value=0 THEN 'C' WHEN cumulative/full_value<=.8 THEN 'A' WHEN cumulative/full_value<=.95 THEN 'B' ELSE 'C' END,
     'cumulative_percent',CASE WHEN full_value>0 THEN cumulative/full_value*100 ELSE 0 END) ORDER BY kind,id),'[]') INTO rows FROM valued v;
   IF p_report='turnover' THEN basis:=basis||jsonb_build_object('turnover_window_days',90,'annualization',4,'average_inventory','current_quantity + consumed/2'); END IF;
   IF p_report='product_performance' THEN basis:=basis||jsonb_build_object('bundle_sales','zero, matching current ProductPerformance source; component cost displayed','sales_window','all posted sales through as_of'); END IF;
 ELSIF p_report='aging' THEN
   WITH docs AS (SELECT 'sales' kind,h.id,h.invoice_number code,h.customer_id party_id,h.transaction_date date,h.total_amount,h.paid_amount FROM sales_invoices h WHERE status='posted'
     UNION ALL SELECT 'purchase',h.id,h.invoice_number,h.supplier_id,h.transaction_date,h.total_amount,h.paid_amount FROM purchase_invoices h WHERE status='posted')
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.kind,q.id),'[]') INTO rows FROM (
     SELECT d.*,p.name,p.type party_type,total_amount-coalesce(paid_amount,0) amount,p_asof-d.date age_days,
       CASE WHEN p_asof-d.date>90 THEN '90+' WHEN p_asof-d.date>60 THEN '61-90' WHEN p_asof-d.date>30 THEN '31-60' ELSE '0-30' END bucket,
       d.kind||':'||d.id row_key FROM docs d LEFT JOIN parties p ON p.id=d.party_id
     WHERE d.date<=p_asof AND total_amount-coalesce(paid_amount,0)>0
       AND (NOT p_filters?'party_id' OR d.party_id=(p_filters->>'party_id')::uuid)
       AND (coalesce(p_filters->>'party_type','all')='all' OR p.type=p_filters->>'party_type')
   ) q;
   basis:=basis||jsonb_build_object('age_basis','invoice transaction date, not contractual due date','paid_amount_basis','current cumulative paid_amount; historical payment rollback unavailable');
 ELSIF p_report='production' THEN
   WITH orders AS (SELECT 'production' kind,id,code,date,status::text,total_cost,created_at FROM production_orders
     UNION ALL SELECT 'packaging',id,code,date,status::text,total_cost,created_at FROM packaging_orders)
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY kind,id),'[]') INTO rows FROM (
     SELECT *,kind||':'||id row_key FROM orders WHERE date BETWEEN ds AND de
       AND (NOT p_filters?'status' OR status=p_filters->>'status')
   ) q;
   SELECT jsonb_build_object('total',count(*),'completed',count(*) FILTER(WHERE j->>'status'='completed'),
     'pending',count(*) FILTER(WHERE j->>'status'='pending'),'in_progress',count(*) FILTER(WHERE j->>'status'='inProgress'),
     'cancelled',count(*) FILTER(WHERE j->>'status'='cancelled'),
     'efficiency_rate',CASE WHEN count(*)>0 THEN round(count(*) FILTER(WHERE j->>'status'='completed')*100.0/count(*)) ELSE 0 END,
     'total_cost',coalesce(sum((j->>'total_cost')::numeric),0)) INTO summary FROM jsonb_array_elements(rows) j;
   basis:=basis||jsonb_build_object('efficiency','completed orders / all filtered orders; full input replaces UI latest50 cap');
 ELSIF p_report='expense_analysis' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT t.id,t.id::text row_key,t.transaction_date date,t.amount,t.category,t.description,tr.name treasury_name
     FROM financial_transactions t LEFT JOIN treasuries tr ON tr.id=t.treasury_id
     WHERE t.transaction_type='expense' AND t.transaction_date BETWEEN ds AND de
       AND (coalesce((p_filters->>'include_payments')::boolean,false) OR t.category !~* '(payment|purchase_payment|دفعة مورد)')
       AND (coalesce((p_filters->>'include_transfers')::boolean,false) OR t.category !~* '(transfer|تحويل)')
       AND (NOT p_filters?'party_id' OR t.party_id=(p_filters->>'party_id')::uuid)
   ) q;
 ELSIF p_report='pnl' THEN
   summary:=factory_private.report_pnl(ds,de); rows:=jsonb_build_array(summary||jsonb_build_object('row_key','pnl'));
   basis:=basis||jsonb_build_object('returns','posted sales returns subtract revenue and historical return COGS','manual_income_expenses','exact configured category name/type; not substring exclusions');
 ELSIF p_report='cost_card' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT f.id,f.id::text row_key,f.code,f.name,f.quantity,f.sales_price,
       coalesce(nullif(f.semi_finished_quantity,0),1) semi_finished_quantity,s.name semi_finished_name,
       coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1) semi_finished_cost,
       coalesce(ing.raw_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1) raw_materials_cost,
       coalesce(ing.components,'[]') raw_materials,coalesce(pkg.components,'[]') packaging_items,coalesce(pkg.cost,0) packaging_cost,
       coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)) total_cost,
       f.sales_price-coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)) margin_amount,
       CASE WHEN f.sales_price>0 THEN (f.sales_price-coalesce(nullif(f.unit_cost,0),coalesce(s.unit_cost,0)*coalesce(nullif(f.semi_finished_quantity,0),1)+coalesce(pkg.cost,0)))/f.sales_price*100 ELSE 0 END margin
     FROM finished_products f LEFT JOIN semi_finished_products s ON s.id=f.semi_finished_id
     LEFT JOIN LATERAL(SELECT sum(r.unit_cost*i.percentage/100) raw_cost,
       jsonb_agg(jsonb_build_object('name',r.name,'percentage',i.percentage,'cost',r.unit_cost*i.percentage/100) ORDER BY i.id) components
       FROM semi_finished_ingredients i JOIN raw_materials r ON r.id=i.raw_material_id WHERE i.semi_finished_id=s.id) ing ON true
     LEFT JOIN LATERAL(SELECT sum(p.unit_cost*i.quantity) cost,
       jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity,'cost',p.unit_cost*i.quantity) ORDER BY i.id) components
       FROM finished_product_packaging i JOIN packaging_materials p ON p.id=i.packaging_material_id WHERE i.finished_product_id=f.id) pkg ON true
     WHERE fp_id IS NULL OR f.id=fp_id
   ) q;
   basis:=basis||jsonb_build_object('current_balances',true,'raw_cost','percentage / 100 source report formula; not order batch cost','total_cost','stored finished WACO when nonzero, else semi WACO quantity plus packaging costs');
 ELSIF p_report='balance_sheet' THEN
   WITH v AS (SELECT
     (SELECT coalesce(sum(quantity*unit_cost),0) FROM factory_private.report_inventory() WHERE kind<>'bundle' OR quantity>0) inventory,
     (SELECT coalesce(sum(balance),0) FROM treasuries) cash,
     (SELECT coalesce(sum(balance),0) FROM parties WHERE type='customer' AND balance>0) receivables,
     (SELECT coalesce(-sum(balance),0) FROM parties WHERE type='supplier' AND balance<0) payables)
   SELECT to_jsonb(v)||jsonb_build_object('assets',inventory+cash+receivables,'liabilities',payables,
     'net_position',inventory+cash+receivables-payables,
     'coverage_ratio',CASE WHEN payables>0 THEN round((inventory+cash+receivables)/payables*100) ELSE 100 END,
     'inventory_breakdown',(SELECT jsonb_agg(to_jsonb(g) ORDER BY kind) FROM(SELECT kind,count(*) count,sum(quantity*unit_cost) value FROM factory_private.report_inventory() WHERE kind<>'bundle' OR quantity>0 GROUP BY kind)g),
     'treasuries',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM(SELECT id,name,type,balance FROM treasuries)t),
     'parties',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM(SELECT id,name,type,balance FROM parties WHERE type='customer' AND balance>0 OR type='supplier' AND balance<0)p)) INTO summary FROM v;
   rows:=jsonb_build_array(summary||jsonb_build_object('row_key','balance_sheet'));
   basis:=basis||jsonb_build_object('current_balances',true,'as_of_meaning','current captured snapshot, historical valuation not available','payable_sign','supplier balance < 0');
 ELSIF p_report='party_analysis' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM (
     SELECT p.id,p.id::text row_key,p.name,p.type party_type,p.balance,abs(p.balance) amount,
       coalesce(i.total,0) total_invoices,coalesce(i.amount,0) invoice_amount,coalesce(i.paid,0) paid,
       coalesce(r.total,0) return_count,coalesce(r.amount,0) return_amount,
       CASE WHEN i.amount>0 THEN coalesce(r.amount,0)/i.amount*100 ELSE 0 END return_percentage,
       greatest(i.last_date,r.last_date) last_date,NULL::numeric avg_payment_days
     FROM parties p LEFT JOIN LATERAL(
       SELECT count(*) total,sum(total_amount) amount,sum(paid_amount) paid,max(date) last_date FROM (
         SELECT total_amount,paid_amount,transaction_date date FROM sales_invoices WHERE status='posted' AND customer_id=p.id AND transaction_date<=p_asof
         UNION ALL SELECT total_amount,paid_amount,transaction_date FROM purchase_invoices WHERE status='posted' AND supplier_id=p.id AND transaction_date<=p_asof) a) i ON true
     LEFT JOIN LATERAL(SELECT count(*) total,sum(total_amount) amount,max(date) last_date FROM (
       SELECT total_amount,return_date date FROM sales_returns WHERE status='posted' AND customer_id=p.id AND return_date<=p_asof
       UNION ALL SELECT total_amount,return_date FROM purchase_returns WHERE status='posted' AND supplier_id=p.id AND return_date<=p_asof)a) r ON true
     WHERE (coalesce(p_filters->>'party_type','all')='all' OR p.type=p_filters->>'party_type')
       AND (NOT p_filters?'party_id' OR p.id=(p_filters->>'party_id')::uuid)
   ) q;
   basis:=basis||jsonb_build_object('current_balances',true,'avg_payment_days','not calculable from current app model; null replaces UI placeholder zero','payable_sign','supplier negative; known UI summary sign mismatch is not copied');
 ELSIF p_report IN ('trends','cash_flow') THEN
   WITH days AS(SELECT d::date date FROM generate_series(ds::timestamp,de::timestamp,interval '1 day') d),
   daily AS(SELECT date,
     coalesce((SELECT sum(total_amount) FROM sales_invoices WHERE status='posted' AND transaction_date=d.date),0) revenue,
     coalesce((SELECT sum(paid_amount) FROM sales_invoices WHERE status='posted' AND transaction_date=d.date),0) sales_paid,
     coalesce((SELECT sum(total_amount) FROM purchase_invoices WHERE status='posted' AND transaction_date=d.date),0) purchases,
     coalesce((SELECT sum(paid_amount) FROM purchase_invoices WHERE status='posted' AND transaction_date=d.date),0) purchase_paid,
     coalesce((SELECT sum(i.quantity*coalesce(i.unit_cost_at_sale,0)) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date=d.date),0) cogs,
     coalesce((SELECT sum(amount) FROM financial_transactions WHERE transaction_type='income' AND transaction_date=d.date),0) other_income,
     coalesce((SELECT sum(amount) FROM financial_transactions WHERE transaction_type='expense' AND transaction_date=d.date AND factory_private.report_operating_category(category)),0) expenses FROM days d)
   SELECT coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('row_key',date,'profit',revenue-cogs-expenses,
     'inflows',sales_paid+other_income,'outflows',purchase_paid+expenses,'net',sales_paid+other_income-purchase_paid-expenses) ORDER BY date),'[]') INTO rows FROM daily v;
   basis:=basis||CASE WHEN p_report='cash_flow' THEN jsonb_build_object('cash_basis','current cumulative invoice paid_amount assigned to invoice date plus all income ledger entries; matches app, not payment-date cash ledger','double_count_warning','invoice-linked receipts may also occur in income entries')
     ELSE jsonb_build_object('profit_basis','posted gross sales - sold historical COGS - expense entries excluding payment/transfer substrings; unlike PNL does not net returns or configured manual income') END;
 ELSIF p_report='product_journey' THEN
   IF fp_id IS NULL OR NOT EXISTS(SELECT 1 FROM finished_products WHERE id=fp_id) THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
   WITH entries AS(
     SELECT 'production' section,i.id,h.created_at::date date,h.status::text,i.quantity,i.unit_cost,i.total_cost amount,h.id operation_id FROM production_order_items i JOIN production_orders h ON h.id=i.production_order_id JOIN finished_products f ON f.semi_finished_id=i.semi_finished_id WHERE f.id=fp_id
     UNION ALL SELECT 'packaging',i.id,h.created_at::date,h.status::text,i.quantity,i.unit_cost,i.total_cost,h.id FROM packaging_order_items i JOIN packaging_orders h ON h.id=i.packaging_order_id WHERE i.finished_product_id=fp_id
     UNION ALL SELECT 'sales',i.id,h.transaction_date,h.status,i.quantity,i.unit_price,i.quantity*i.unit_price,h.id FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE i.finished_product_id=fp_id)
   SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('row_key',section||':'||id,
     'unit_price',CASE WHEN section='sales' THEN unit_cost ELSE NULL END,
     'unit_cost',CASE WHEN section='sales' THEN NULL ELSE unit_cost END) ORDER BY section,id),'[]') INTO rows FROM entries e WHERE date BETWEEN ds AND de AND (NOT p_filters?'status' OR status=p_filters->>'status');
   SELECT jsonb_build_object('total_produced',coalesce(sum((j->>'quantity')::numeric) FILTER(WHERE j->>'section'='packaging' AND j->>'status'='completed'),0),
     'total_sold',coalesce(sum((j->>'quantity')::numeric) FILTER(WHERE j->>'section'='sales'),0),
     'total_revenue',coalesce(sum((j->>'amount')::numeric) FILTER(WHERE j->>'section'='sales'),0),
     'cost_cards',factory_private.report_build('cost_card',jsonb_build_object('item_id',fp_id),p_asof)->'rows') INTO summary FROM jsonb_array_elements(rows)j;
   basis:=basis||jsonb_build_object('journey_status','all statuses unless status requested, matching source history query','full_history','UI limit10 removed; cost card in summary');
 ELSIF p_report='dashboard' THEN
   WITH d AS(SELECT coalesce(sum(total_amount),0) daily_sales FROM sales_invoices WHERE created_at>=p_asof AND created_at<p_asof+1)
   SELECT to_jsonb(d)||jsonb_build_object('active_orders',(SELECT count(*) FROM production_orders WHERE status::text IN('pending','inProgress'))+(SELECT count(*) FROM packaging_orders WHERE status::text IN('pending','inProgress')),
     'low_stock_count',(SELECT count(*) FROM raw_materials WHERE quantity<=min_stock),'cash_balance',(SELECT coalesce(sum(balance),0) FROM treasuries)) INTO summary FROM d;
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY id),'[]') INTO rows FROM(
     SELECT a.id,a.id::text row_key,a.action,a.table_name,a.created_at,p.full_name user_name FROM audit_logs a LEFT JOIN profiles p ON p.id=a.user_id WHERE a.created_at<p_asof+1
   )q;
   basis:=basis||jsonb_build_object('current_balances',true,'daily_sales','created_at day, all statuses; source Dashboard RPC','audit','full history through as_of, replaces recent10 presentation');
 ELSIF p_report='decision_support' THEN
   -- Preserve source executive gross-sales/historical-COGS formula, distinct from named PNL.
   WITH v AS(SELECT
     (SELECT coalesce(sum(balance),0) FROM treasuries) treasury_balance,
     (SELECT coalesce(sum(balance),0) FROM parties WHERE type='customer' AND balance>0) receivables,
     (SELECT coalesce(-sum(balance),0) FROM parties WHERE type='supplier' AND balance<0) payables,
     (SELECT count(*) FROM production_orders WHERE status='pending') pending_production,
     (SELECT count(*) FROM packaging_orders WHERE status='pending') pending_packaging,
     (SELECT coalesce(sum(total_cost),0) FROM production_orders WHERE status='pending') production_value,
     (SELECT coalesce(sum(total_cost),0) FROM packaging_orders WHERE status='pending') packaging_value,
     (SELECT coalesce(p_asof-min(date),0) FROM(SELECT date FROM production_orders WHERE status='pending' UNION ALL SELECT date FROM packaging_orders WHERE status='pending')x) oldest_pending_days,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date BETWEEN p_asof-30 AND p_asof) revenue30d,
     (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_sale,0)),0) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date BETWEEN p_asof-30 AND p_asof) cogs30d,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=p_asof-60 AND transaction_date<p_asof-30) previous_revenue30d,
     (SELECT coalesce(sum(i.quantity*coalesce(i.unit_cost_at_sale,0)),0) FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date>=p_asof-60 AND h.transaction_date<p_asof-30) previous_cogs30d)
   SELECT to_jsonb(v)||jsonb_build_object('net_cash',treasury_balance+receivables-payables,'gross_margin',revenue30d-cogs30d,
     'gross_margin_percent',CASE WHEN revenue30d>0 THEN round((revenue30d-cogs30d)/revenue30d*100) ELSE 0 END,
     'revenue_change',CASE WHEN previous_revenue30d>0 THEN round((revenue30d-previous_revenue30d)/previous_revenue30d*100) ELSE 0 END,
     'margin_change',round(CASE WHEN revenue30d>0 THEN (revenue30d-cogs30d)/revenue30d*100 ELSE 0 END-CASE WHEN previous_revenue30d>0 THEN (previous_revenue30d-previous_cogs30d)/previous_revenue30d*100 ELSE 0 END)) INTO summary FROM v;
   -- Flat rows, so coverage, product and trend details can actually be paged.
   WITH usage AS(SELECT item_id,sum(quantity)/30 avg_daily_usage FROM inventory_movements
     WHERE item_type::text='raw_materials' AND movement_type='out' AND created_at>=p_asof-30 AND created_at<p_asof+1 GROUP BY item_id)
   SELECT coalesce(jsonb_agg(jsonb_build_object('row_key','coverage:'||r.id,'section','coverage','id',r.id,'name',r.name,
     'quantity',r.quantity,'min_stock',r.min_stock,'avg_daily_usage',round(u.avg_daily_usage,2),
     'days_left',round(r.quantity/u.avg_daily_usage),'status',CASE WHEN r.quantity/u.avg_daily_usage<7 THEN 'critical' WHEN r.quantity/u.avg_daily_usage<14 THEN 'warning' ELSE 'ok' END) ORDER BY r.id),'[]') INTO rows
     FROM raw_materials r JOIN usage u ON u.item_id=r.id WHERE u.avg_daily_usage>0;
   SELECT coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('row_key','product:'||id,'section','profitability_products') ORDER BY id),'[]') INTO extra FROM(
     SELECT f.id,f.name,sum(i.quantity*i.unit_price) revenue,sum(i.quantity*(i.unit_price-coalesce(i.unit_cost_at_sale,0))) margin
     FROM sales_invoice_items i JOIN sales_invoices h ON h.id=i.invoice_id JOIN finished_products f ON f.id=i.finished_product_id
     WHERE h.status='posted' AND h.transaction_date BETWEEN p_asof-30 AND p_asof GROUP BY f.id,f.name)q;
   rows:=rows||extra;
   SELECT coalesce(jsonb_agg(j||jsonb_build_object('section','trends','row_key','trend:'||(j->>'date')) ORDER BY j->>'date'),'[]') INTO extra
     FROM jsonb_array_elements(factory_private.report_build('trends',jsonb_build_object('start_date',p_asof-29,'end_date',p_asof),p_asof)->'rows')j;
   rows:=rows||extra;
   WITH stats AS(SELECT
     (SELECT count(*) FROM raw_materials WHERE min_stock>0 AND quantity<min_stock) raw_low,
     (SELECT count(*) FROM packaging_materials WHERE min_stock>0 AND quantity<min_stock) packaging_low,
     (SELECT count(*) FROM production_orders WHERE status='pending' AND date<p_asof-7) old_production,
     (SELECT count(*) FROM sales_invoices WHERE status='posted' AND transaction_date<p_asof-60 AND total_amount-coalesce(paid_amount,0)>0) overdue,
     (SELECT coalesce(sum(total_amount-coalesce(paid_amount,0)),0) FROM sales_invoices WHERE status='posted' AND transaction_date<p_asof-60 AND total_amount-coalesce(paid_amount,0)>0) overdue_amount,
     (SELECT count(*) FROM treasuries WHERE balance<0) negative_treasury,
     (SELECT count(*) FROM finished_products WHERE sales_price>0 AND unit_cost>sales_price) negative_margin,
     (SELECT count(*) FROM finished_products WHERE sales_price>0 AND (sales_price-unit_cost)/sales_price>=0 AND (sales_price-unit_cost)/sales_price<.15) low_margin,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date BETWEEN p_asof-7 AND p_asof) this_week,
     (SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=p_asof-14 AND transaction_date<p_asof-7) last_week,
     (SELECT count(*) FROM finished_products f WHERE quantity>0 AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.item_type::text='finished_products' AND m.item_id=f.id AND m.created_at>=p_asof-30 AND m.created_at<p_asof+1)) stagnant),
   alerts AS(SELECT a.* FROM stats s CROSS JOIN LATERAL(VALUES
     ('low-stock-raw',CASE WHEN raw_low>5 THEN 'critical' ELSE 'warning' END,'inventory',raw_low::numeric,raw_low>0,'/reports/low-stock'),
     ('low-stock-pkg',CASE WHEN packaging_low>3 THEN 'critical' ELSE 'warning' END,'inventory',packaging_low::numeric,packaging_low>0,'/reports/low-stock'),
     ('pending-production','warning','production',old_production::numeric,old_production>0,'/production/orders'),
     ('overdue-receivables','critical','finance',overdue_amount,overdue>0,'/reports/aging'),
     ('negative-treasury','critical','finance',negative_treasury::numeric,negative_treasury>0,'/treasuries'),
     ('negative-margin','critical','sales',negative_margin::numeric,negative_margin>0,'/reports/pricing-analysis'),
     ('low-margin','warning','sales',low_margin::numeric,negative_margin=0 AND low_margin>0,'/reports/pricing-analysis'),
     ('declining-sales','warning','sales',CASE WHEN last_week>0 THEN round((last_week-this_week)/last_week*100) ELSE 0 END,last_week>0 AND this_week<last_week*.7,'/reports/trends'),
     ('supplier-payables',CASE WHEN (summary->>'payables')::numeric>50000 THEN 'warning' ELSE 'info' END,'finance',(summary->>'payables')::numeric,(summary->>'payables')::numeric>0,'/reports/aging'),
     ('stagnant-inventory','info','inventory',stagnant::numeric,stagnant>0,'/reports/inventory-analytics'))a(id,severity,category,value,shown,path) WHERE shown)
   SELECT coalesce(jsonb_agg(jsonb_build_object('row_key','alert:'||id,'section','alert','id',id,'severity',severity,'category',category,'value',value,'path',path) ORDER BY id),'[]') INTO extra FROM alerts;
   rows:=rows||extra;
   basis:=basis||jsonb_build_object('current_balances',true,'coverage_columns','uses actual movement_type/created_at, correcting source direction/movement_date mismatch',
     'profitability','source posted gross sales/historical sold COGS; source current30d window includes both cutoff dates',
     'detail_scope','all profitability products instead of only top5; all alert types with numeric evidence, UI labels omitted');
 ELSE RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- Full summary from the materialized set, before ORDER/LIMIT. Each named report retains section-specific summary.
 IF jsonb_typeof(summary)<>'object' THEN summary:=jsonb_build_object('details',summary); END IF;
 SELECT jsonb_build_object('row_count',count(*),'amount',coalesce(sum((j->>'amount')::numeric),0),
   'value',coalesce(sum((j->>'value')::numeric),0),'revenue',coalesce(sum((j->>'revenue')::numeric),0),
   'quantity',coalesce(sum((j->>'quantity')::numeric),0),'expenses',coalesce(sum((j->>'expenses')::numeric),0),
   'average_margin',coalesce(avg((j->>'margin')::numeric),0),'potential_profit',coalesce(sum((j->>'potential_profit')::numeric),0),
   'categories',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY category),'[]') FROM(
       SELECT x->>'category' category,count(*) count,sum((x->>'amount')::numeric) amount
       FROM jsonb_array_elements(rows)x WHERE x?'category' GROUP BY x->>'category')g),
   'group_totals',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY group_key),'[]') FROM(
       SELECT coalesce(x->>'bucket',x->>'kind',x->>'party_type',x->>'section') group_key,count(*) count,
         coalesce(sum((x->>'amount')::numeric),0) amount,coalesce(sum((x->>'value')::numeric),0) value,
         count(*) FILTER(WHERE x->>'status'='completed') completed,count(*) FILTER(WHERE x->>'status'='pending') pending,
       count(*) FILTER(WHERE x->>'urgency'='critical') critical,
       count(*) FILTER(WHERE (x->>'turnover')::numeric<2 AND (x->>'consumed')::numeric>0) slow_moving,
       count(*) FILTER(WHERE (x->>'turnover')::numeric>=6) fast_moving,
       count(*) FILTER(WHERE (x->>'consumed')::numeric=0 AND (x->>'quantity')::numeric>0) dead_stock
       FROM jsonb_array_elements(rows)x GROUP BY coalesce(x->>'bucket',x->>'kind',x->>'party_type',x->>'section'))g),
   'profit',coalesce(sum((j->>'profit')::numeric),0),'inflows',coalesce(sum((j->>'inflows')::numeric),0),
   'outflows',coalesce(sum((j->>'outflows')::numeric),0),'net',coalesce(sum((j->>'net')::numeric),0),
   'average_amount',coalesce(avg((j->>'amount')::numeric),0),
   'monthly',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY month),'[]') FROM(
       SELECT left(x->>'date',7) AS month,coalesce(sum((x->>'revenue')::numeric),0) revenue,
       coalesce(sum((x->>'cogs')::numeric),0) cogs,coalesce(sum((x->>'purchases')::numeric),0) purchases,
       coalesce(sum((x->>'expenses')::numeric),0) expenses,coalesce(sum((x->>'profit')::numeric),0) profit,
       coalesce(sum((x->>'inflows')::numeric),0) inflows,coalesce(sum((x->>'outflows')::numeric),0) outflows,
       coalesce(sum((x->>'net')::numeric),0) net FROM jsonb_array_elements(rows)x WHERE x?'date' GROUP BY left(x->>'date',7))g))||summary INTO summary FROM jsonb_array_elements(rows)j;
 IF p_report='trends' THEN
   summary:=summary||jsonb_build_object('previous_sales',(SELECT coalesce(sum(total_amount),0) FROM sales_invoices WHERE status='posted' AND transaction_date>=ds-(de-ds+1) AND transaction_date<ds),
     'previous_purchases',(SELECT coalesce(sum(total_amount),0) FROM purchase_invoices WHERE status='posted' AND transaction_date>=ds-(de-ds+1) AND transaction_date<ds));
 END IF;
 RETURN jsonb_build_object('rows',rows,'summary',summary,'calculation_basis',basis);
END $function$;

DROP FUNCTION factory_private.report_build(text,jsonb,date);

DROP FUNCTION factory_private.report_profit_legacy_context(text,jsonb,date);

DROP FUNCTION factory_private.report_profit_days(date,date);

DROP FUNCTION factory_private.report_profit_cash_values(jsonb,jsonb);

DROP FUNCTION factory_private.report_profit_totals(jsonb);

ALTER FUNCTION factory_private.report_build_before_profit_ledger(text,jsonb,date) RENAME TO report_build;

COMMIT;
