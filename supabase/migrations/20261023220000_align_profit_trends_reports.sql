-- Local read-only reporting candidate; no posting/balance/authorization/snapshot mutations.

BEGIN;

DO $guard$ BEGIN

 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PROFIT_LEDGER_OWNER_REQUIRED'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='ca6297d81e65595fa67e2db3d950f696' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)) THEN RAISE EXCEPTION 'PROFIT_LEDGER_DEFINITION_DRIFT: report_build(text,jsonb,date)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build_before_cash_ledger(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='fcfcfffbff25223c25e6d0b9fa78fddb' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)) THEN RAISE EXCEPTION 'PROFIT_LEDGER_DEFINITION_DRIFT: report_build_before_cash_ledger(text,jsonb,date)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_cash_ledger(jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='1b9875129e279a876e875aa262aaa540' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)) THEN RAISE EXCEPTION 'PROFIT_LEDGER_DEFINITION_DRIFT: report_cash_ledger(jsonb,date)'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_pnl(date,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='733c53418f7a54d26df95f437909bb65' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner)) THEN RAISE EXCEPTION 'PROFIT_LEDGER_DEFINITION_DRIFT: report_pnl(date,date)'; END IF;

 IF to_regprocedure('factory_private.report_profit_legacy_context(text,jsonb,date)') IS NOT NULL THEN RAISE EXCEPTION 'PROFIT_LEDGER_NAME_IN_USE'; END IF;

 IF to_regprocedure('factory_private.report_profit_totals(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'PROFIT_LEDGER_NAME_IN_USE'; END IF;

 IF to_regprocedure('factory_private.report_profit_days(date,date)') IS NOT NULL THEN RAISE EXCEPTION 'PROFIT_LEDGER_NAME_IN_USE'; END IF;

 IF to_regprocedure('factory_private.report_profit_cash_values(jsonb,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'PROFIT_LEDGER_NAME_IN_USE'; END IF;

 IF to_regprocedure('factory_private.report_build_before_profit_ledger(text,jsonb,date)') IS NOT NULL THEN RAISE EXCEPTION 'PROFIT_LEDGER_NAME_IN_USE'; END IF;

END $guard$;

ALTER FUNCTION factory_private.report_build(text,jsonb,date) RENAME TO report_build_before_profit_ledger;

-- Preserve legacy nested cost-card and decision-support trend dispatch explicitly.
-- Hosted postgres is not a superuser; no custom session parameter is required.
DO $legacy_dispatch$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('factory_private.report_build_before_cash_ledger(text,jsonb,date)'::regprocedure);
 IF (length(definition)-length(replace(definition,'factory_private.report_build(','')))/length('factory_private.report_build(')<>2 THEN
  RAISE EXCEPTION 'PROFIT_LEDGER_LEGACY_DISPATCH_DRIFT';
 END IF;
 EXECUTE replace(definition,'factory_private.report_build(','factory_private.report_build_before_profit_ledger(');
END $legacy_dispatch$;


CREATE FUNCTION factory_private.report_profit_legacy_context(p_report text,p_filters jsonb,p_asof date) RETURNS jsonb
LANGUAGE plpgsql  SECURITY DEFINER SET search_path=public,pg_temp AS $profit$
BEGIN
 RETURN factory_private.report_build_before_profit_ledger(p_report,p_filters,p_asof);
END
$profit$;

CREATE FUNCTION factory_private.report_profit_totals(p_rows jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $profit$
 WITH totals AS (SELECT jsonb_object_agg(k,(SELECT coalesce(sum((j->>k)::numeric),0) FROM jsonb_array_elements(p_rows) j)) value FROM unnest(ARRAY['sales_revenue','returns_amount','manual_revenue','sales_cogs','return_cogs','expenses','purchases','revenue','cogs','gross_profit','net_profit','profit']) k)
 SELECT value||jsonb_build_object('exact',(SELECT jsonb_object_agg(key,trim_scale(value::numeric)::text) FROM jsonb_each_text(t.value))) FROM totals t;
$profit$;

CREATE FUNCTION factory_private.report_profit_days(ds date,de date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $profit$
DECLARE result jsonb; rows jsonb; months jsonb;
BEGIN
 IF ds>de THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- Match the finite-value validation of the qualified UI without reconstructing costs.
 IF EXISTS(SELECT 1 FROM (
  SELECT h.total_amount n FROM public.sales_invoices h WHERE h.status='posted' AND h.transaction_date BETWEEN ds AND de
  UNION ALL SELECT h.total_amount FROM public.sales_returns h WHERE h.status='posted' AND h.return_date BETWEEN ds AND de
  UNION ALL SELECT h.total_amount FROM public.purchase_invoices h WHERE h.status='posted' AND h.transaction_date BETWEEN ds AND de
  UNION ALL SELECT f.amount FROM public.financial_transactions f WHERE f.transaction_type IN('income','expense') AND f.transaction_date BETWEEN ds AND de
  UNION ALL SELECT i.quantity FROM public.sales_invoice_items i JOIN public.sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date BETWEEN ds AND de
  UNION ALL SELECT i.unit_cost_at_sale FROM public.sales_invoice_items i JOIN public.sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date BETWEEN ds AND de AND i.unit_cost_at_sale IS NOT NULL
  UNION ALL SELECT i.quantity FROM public.sales_return_items i JOIN public.sales_returns h ON h.id=i.return_id WHERE h.status='posted' AND h.return_date BETWEEN ds AND de
  UNION ALL SELECT i.unit_cost_at_return FROM public.sales_return_items i JOIN public.sales_returns h ON h.id=i.return_id WHERE h.status='posted' AND h.return_date BETWEEN ds AND de AND i.unit_cost_at_return IS NOT NULL
 ) values_to_check WHERE n IS NULL OR n::text IN('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'MCP_PROFIT_AMOUNT_INVALID'; END IF;
 WITH calendar AS(SELECT d::date date FROM generate_series(ds::timestamp,de::timestamp,interval '1 day') d),
 sales AS(SELECT transaction_date date,sum(total_amount) amount,count(*) n FROM public.sales_invoices WHERE status='posted' AND transaction_date BETWEEN ds AND de GROUP BY transaction_date),
 returns AS(SELECT return_date date,sum(total_amount) amount,count(*) n FROM public.sales_returns WHERE status='posted' AND return_date BETWEEN ds AND de GROUP BY return_date),
 purchases AS(SELECT transaction_date date,sum(total_amount) amount,count(*) n FROM public.purchase_invoices WHERE status='posted' AND transaction_date BETWEEN ds AND de GROUP BY transaction_date),
 sales_cost AS(SELECT h.transaction_date date,sum(i.quantity*coalesce(i.unit_cost_at_sale,0)) amount,count(*) n,count(*) FILTER(WHERE i.unit_cost_at_sale IS NULL) missing FROM public.sales_invoice_items i JOIN public.sales_invoices h ON h.id=i.invoice_id WHERE h.status='posted' AND h.transaction_date BETWEEN ds AND de GROUP BY h.transaction_date),
 return_cost AS(SELECT h.return_date date,sum(i.quantity*coalesce(i.unit_cost_at_return,0)) amount,count(*) n,count(*) FILTER(WHERE i.unit_cost_at_return IS NULL) missing FROM public.sales_return_items i JOIN public.sales_returns h ON h.id=i.return_id WHERE h.status='posted' AND h.return_date BETWEEN ds AND de GROUP BY h.return_date),
 finance_classified AS(SELECT f.*,EXISTS(SELECT 1 FROM public.financial_categories c WHERE c.name=f.category AND c.type=f.transaction_type) configured FROM public.financial_transactions f WHERE f.transaction_type IN('income','expense') AND f.transaction_date BETWEEN ds AND de),
 finance AS(SELECT transaction_date date,
  sum(amount) FILTER(WHERE transaction_type='income' AND configured) manual_revenue,
  sum(amount) FILTER(WHERE transaction_type='expense' AND configured) expenses,
  count(*) FILTER(WHERE transaction_type='income' AND NOT configured) excluded_income_count,
  sum(amount) FILTER(WHERE transaction_type='income' AND NOT configured) excluded_income_amount,
  count(*) FILTER(WHERE transaction_type='expense' AND NOT configured) excluded_expense_count,
  sum(amount) FILTER(WHERE transaction_type='expense' AND NOT configured) excluded_expense_amount,count(*) n
  FROM finance_classified GROUP BY transaction_date),
 components AS(SELECT d.date,coalesce(s.amount,0) sales_revenue,coalesce(r.amount,0) returns_amount,coalesce(f.manual_revenue,0) manual_revenue,
  coalesce(sc.amount,0) sales_cogs,coalesce(rc.amount,0) return_cogs,coalesce(f.expenses,0) expenses,coalesce(p.amount,0) purchases,
  coalesce(sc.missing,0) missing_sales_cost_count,coalesce(rc.missing,0) missing_return_cost_count,
  coalesce(f.excluded_income_count,0) excluded_income_count,coalesce(f.excluded_income_amount,0) excluded_income_amount,
  coalesce(f.excluded_expense_count,0) excluded_expense_count,coalesce(f.excluded_expense_amount,0) excluded_expense_amount,
  coalesce(s.n,0) sales_count,coalesce(r.n,0) returns_count,coalesce(p.n,0) purchases_count,coalesce(sc.n,0) sales_cost_count,coalesce(rc.n,0) return_cost_count,coalesce(f.n,0) finance_count
  FROM calendar d LEFT JOIN sales s USING(date) LEFT JOIN returns r USING(date) LEFT JOIN purchases p USING(date) LEFT JOIN sales_cost sc USING(date) LEFT JOIN return_cost rc USING(date) LEFT JOIN finance f USING(date)),
 net AS(SELECT *,sales_revenue-returns_amount+manual_revenue revenue,sales_cogs-return_cogs cogs FROM components),
 valued AS(SELECT *,revenue-cogs gross_profit,revenue-cogs-expenses net_profit,revenue-cogs-expenses profit FROM net)
 SELECT jsonb_build_object('rows',coalesce(jsonb_agg(factory_private.report_profit_totals(jsonb_build_array(to_jsonb(v)))||jsonb_build_object('date',date,'row_key',date) ORDER BY date),'[]'),
  'diagnostics',jsonb_build_object('missing_sales_cost_count',coalesce(sum(missing_sales_cost_count),0),'missing_return_cost_count',coalesce(sum(missing_return_cost_count),0),
   'excluded_income_count',coalesce(sum(excluded_income_count),0),'excluded_income_amount',trim_scale(coalesce(sum(excluded_income_amount),0))::text,
   'excluded_expense_count',coalesce(sum(excluded_expense_count),0),'excluded_expense_amount',trim_scale(coalesce(sum(excluded_expense_amount),0))::text),
  'source_counts',jsonb_build_object('sales',coalesce(sum(sales_count),0),'returns',coalesce(sum(returns_count),0),'purchases',coalesce(sum(purchases_count),0),
   'sales_costs',coalesce(sum(sales_cost_count),0),'return_costs',coalesce(sum(return_cost_count),0),'finance',coalesce(sum(finance_count),0),
   'categories',(SELECT count(*) FROM public.financial_categories))) INTO result FROM valued v;
 rows:=result->'rows';
 SELECT coalesce(jsonb_agg(factory_private.report_profit_totals(points)||jsonb_build_object('month',month) ORDER BY month),'[]') INTO months
 FROM(SELECT left(j->>'date',7) AS month,jsonb_agg(j ORDER BY j->>'date') points FROM jsonb_array_elements(rows) j GROUP BY left(j->>'date',7)) m;
 RETURN result||jsonb_build_object('summary',factory_private.report_profit_totals(rows),'monthly',months);
END
$profit$;

CREATE FUNCTION factory_private.report_profit_cash_values(p_groups jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $profit$
 WITH scope AS(SELECT jsonb_array_length(p_groups) n,p_groups->0 g,
  jsonb_array_length(p_scope->'currency_groups') scope_n,p_scope->>'unavailable_reason' scope_reason,
  p_scope->'currency_groups'->0->>'currency' scope_currency,
  jsonb_array_length(p_scope->'currency_groups')=0 OR p_scope->>'inflows' IS NOT NULL scope_available),
 scalar AS(SELECT *,scope_available AND (n=0 OR n=1 AND coalesce((g->>'totals_available')::boolean,false)) available FROM scope),
 cash_values AS(SELECT *,CASE WHEN available AND n=0 THEN 0 WHEN available THEN (g->>'inflows')::numeric END incoming,
  CASE WHEN available AND n=0 THEN 0 WHEN available THEN (g->>'outflows')::numeric END outgoing,
  CASE WHEN available AND n=0 THEN 0 WHEN available THEN (g->>'net')::numeric END net FROM scalar)
 SELECT jsonb_build_object('inflows',incoming,'outflows',outgoing,'net',net,'other_income',incoming,
  'cash_currency',CASE WHEN scope_n=1 THEN scope_currency END,'cash_totals_available',available,
  'cash_unavailable_reason',CASE WHEN available THEN NULL WHEN NOT scope_available THEN scope_reason WHEN n>1 THEN 'multiple_currencies' ELSE 'invalid_ledger_entries' END,
  'cash_exact',jsonb_build_object('inflows',trim_scale(incoming)::text,'outflows',trim_scale(outgoing)::text,'net',trim_scale(net)::text,'other_income',trim_scale(incoming)::text),
  'cash_by_currency',p_groups) FROM cash_values;
$profit$;

CREATE FUNCTION factory_private.report_build(p_report text,p_filters jsonb,p_asof date) RETURNS jsonb
LANGUAGE plpgsql  SECURITY DEFINER SET search_path=public,pg_temp AS $profit$
DECLARE ds date;de date;target numeric;basis jsonb;current_profit jsonb;previous_profit jsonb;cash jsonb;rows jsonb;months jsonb;summary jsonb;result jsonb;key text;previous_net numeric;delta numeric;
BEGIN

 IF p_report IS NULL OR p_report NOT IN('pnl','trends') THEN RETURN factory_private.report_profit_legacy_context(p_report,p_filters,p_asof); END IF;
 ds:=coalesce((p_filters->>'start_date')::date,p_asof-(coalesce((p_filters->>'period')::int,30)-1));de:=coalesce((p_filters->>'end_date')::date,p_asof);target:=coalesce((p_filters->>'target_margin')::numeric,25);
 IF ds>de OR de>p_asof OR target<0 OR target>=100 THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 current_profit:=factory_private.report_profit_days(ds,de);
 basis:=jsonb_build_object('source','shared canonical current application PNL components','calculation_version',2,'start_date',ds,'end_date',de,'as_of',p_asof,'complete_input_set',true,'current_balances',false,'currency','EGP',
  'profit_basis','posted sales - posted returns + exact configured income - historical net COGS - exact configured expenses; purchases independent',
  'returns','posted return_date and recorded historical return cost; missing historical cost remains zero with diagnostics',
  'category_basis','current exact name/type configuration; no automatic adoption or historical category snapshot',
  'decimal_values','existing numeric fields retained; exact contains canonical decimal strings; cash_exact is separately currency-scoped',
  'snapshot','existing actor/client/resource-bound snapshots and paging unchanged; old snapshots retain their captured calculation basis');
 IF p_report='pnl' THEN
  result:=factory_private.report_profit_legacy_context(p_report,p_filters,p_asof);
  FOREACH key IN ARRAY ARRAY['sales_revenue','returns_amount','manual_revenue','sales_cogs','return_cogs','expenses','revenue','cogs','gross_profit','net_profit'] LOOP
   IF result->'summary'->key IS DISTINCT FROM current_profit->'summary'->key THEN RAISE EXCEPTION 'MCP_PROFIT_COMPONENT_MISMATCH'; END IF;
  END LOOP;
  summary:=result->'summary'||jsonb_build_object('exact',(current_profit->'summary'->'exact')-'profit','diagnostics',current_profit->'diagnostics','source_counts',current_profit->'source_counts','calculation_version',2,'purchases',current_profit->'summary'->'purchases');
  SELECT jsonb_agg(j||jsonb_build_object('exact',(current_profit->'summary'->'exact')-'profit','purchases',current_profit->'summary'->'purchases')) INTO rows FROM jsonb_array_elements(result->'rows') j;
  RETURN result||jsonb_build_object('rows',rows,'summary',summary,'calculation_basis',result->'calculation_basis'||basis);
 END IF;
 previous_profit:=factory_private.report_profit_days(ds-(de-ds+1),ds-1);
 cash:=factory_private.report_cash_ledger(p_filters,p_asof);
 WITH cash_days AS(SELECT j->>'date' date,jsonb_agg(j ORDER BY j->>'currency_key') groups FROM jsonb_array_elements(cash->'rows') j GROUP BY j->>'date'),
 sales_paid AS(SELECT transaction_date date,coalesce(sum(paid_amount),0) amount FROM public.sales_invoices WHERE status='posted' AND transaction_date BETWEEN ds AND de GROUP BY transaction_date),
 purchase_paid AS(SELECT transaction_date date,coalesce(sum(paid_amount),0) amount FROM public.purchase_invoices WHERE status='posted' AND transaction_date BETWEEN ds AND de GROUP BY transaction_date)
 SELECT coalesce(jsonb_agg(d||factory_private.report_profit_cash_values(coalesce(c.groups,'[]'),cash->'summary')||jsonb_build_object('sales_paid',coalesce(s.amount,0),'purchase_paid',coalesce(p.amount,0),
  'invoice_paid_exact',jsonb_build_object('sales_paid',trim_scale(coalesce(s.amount,0))::text,'purchase_paid',trim_scale(coalesce(p.amount,0))::text)) ORDER BY d->>'date'),'[]') INTO rows
 FROM jsonb_array_elements(current_profit->'rows') d LEFT JOIN cash_days c ON c.date=d->>'date' LEFT JOIN sales_paid s ON s.date=(d->>'date')::date LEFT JOIN purchase_paid p ON p.date=(d->>'date')::date;
 WITH cash_months AS(SELECT j->>'month' AS month,jsonb_agg(j ORDER BY j->>'currency_key') groups FROM jsonb_array_elements(cash->'summary'->'monthly') j GROUP BY j->>'month')
 SELECT coalesce(jsonb_agg(m||factory_private.report_profit_cash_values(coalesce(c.groups,'[]'),cash->'summary') ORDER BY m->>'month'),'[]') INTO months
 FROM jsonb_array_elements(current_profit->'monthly') m LEFT JOIN cash_months c ON c.month=m->>'month';
 previous_net:=(previous_profit->'summary'->>'net_profit')::numeric;delta:=(current_profit->'summary'->>'net_profit')::numeric-previous_net;
 summary:=jsonb_build_object('row_count',jsonb_array_length(rows),'amount',0,'value',0,'quantity',0,'average_margin',0,'potential_profit',0,'categories','[]'::jsonb,'average_amount',0,
  'group_totals',jsonb_build_array(jsonb_build_object('group_key',NULL,'count',jsonb_array_length(rows),'amount',0,'value',0,'completed',0,'pending',0,'critical',0,'slow_moving',0,'fast_moving',0,'dead_stock',0)))
  ||(current_profit->'summary')||factory_private.report_profit_cash_values(cash->'summary'->'currency_groups',cash->'summary')
  ||jsonb_build_object('monthly',months,'diagnostics',current_profit->'diagnostics','source_counts',current_profit->'source_counts','calculation_version',2,
   'previous_sales',previous_profit->'summary'->'sales_revenue','previous_purchases',previous_profit->'summary'->'purchases',
   'previous_period',jsonb_build_object('start_date',ds-(de-ds+1),'end_date',ds-1,'net_profit',previous_net,'delta',delta,'percent',CASE WHEN previous_net>0 THEN delta/previous_net*100 END,
    'exact',jsonb_build_object('net_profit',trim_scale(previous_net)::text,'delta',trim_scale(delta)::text,'percent',CASE WHEN previous_net>0 THEN trim_scale(delta/previous_net*100)::text END)),
   'cash',jsonb_build_object('report','cash_flow','calculation_version',2,'movement_count',cash->'summary'->'movement_count','unknown_currency',cash->'summary'->'unknown_currency'));
 basis:=basis||jsonb_build_object('compatibility','trends revenue is now net PNL revenue; cogs nets returns, expenses use configured categories, profit aliases net_profit',
  'cash_basis','legacy field names retained with corrected cash ledger once on transaction_date; other_income aliases ledger recorded inflows, never added to sales_paid',
  'cash_currency','independent of profit EGP basis; groups retain treasury currencies, mixed/unknown/invalid period blocks scalar cash across every day/month; currency groups retained; entirely empty periods are zero',
  'invoice_paid_fields','sales_paid/purchase_paid remain current cumulative invoice paid amounts on invoice date for information only; not used in cash inflows/outflows/net');
 RETURN jsonb_build_object('rows',rows,'summary',summary,'calculation_basis',basis);
END
$profit$;

REVOKE ALL ON FUNCTION factory_private.report_profit_legacy_context(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

REVOKE ALL ON FUNCTION factory_private.report_profit_totals(jsonb) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

REVOKE ALL ON FUNCTION factory_private.report_profit_days(date,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

REVOKE ALL ON FUNCTION factory_private.report_profit_cash_values(jsonb,jsonb) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

REVOKE ALL ON FUNCTION factory_private.report_build(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

REVOKE ALL ON FUNCTION factory_private.report_build_before_profit_ledger(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;

DO $acl$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=ANY(ARRAY['factory_private.report_profit_legacy_context(text,jsonb,date)'::regprocedure,'factory_private.report_profit_totals(jsonb)'::regprocedure,'factory_private.report_profit_days(date,date)'::regprocedure,'factory_private.report_profit_cash_values(jsonb,jsonb)'::regprocedure,'factory_private.report_build(text,jsonb,date)'::regprocedure,'factory_private.report_build_before_profit_ledger(text,jsonb,date)'::regprocedure])AND a.grantee<>p.proowner)THEN RAISE EXCEPTION 'PROFIT_LEDGER_UNEXPECTED_GRANT';END IF;END $acl$;

COMMIT;
