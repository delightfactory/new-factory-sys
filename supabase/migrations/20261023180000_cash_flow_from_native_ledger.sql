-- Local development candidate. Report reads only; posting and balance rules are unchanged.
BEGIN;

DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('factory_private.report_build(text,jsonb,date)')
  AND md5(replace(p.prosrc,E'\r\n',E'\n'))='fcfcfffbff25223c25e6d0b9fa78fddb' AND pg_get_userbyid(p.proowner)='postgres'
  AND p.prosecdef AND p.prorettype='jsonb'::regtype AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))
 THEN RAISE EXCEPTION 'CASH_LEDGER_DEFINITION_DRIFT: factory_private.report_build(text,jsonb,date)'; END IF;
 IF to_regprocedure('factory_private.report_build_before_cash_ledger(text,jsonb,date)') IS NOT NULL THEN RAISE EXCEPTION 'CASH_LEDGER_NAME_IN_USE'; END IF;
 IF to_regprocedure('factory_private.report_cash_ledger(jsonb,date)') IS NOT NULL THEN RAISE EXCEPTION 'CASH_LEDGER_NAME_IN_USE'; END IF;
END $guard$;

ALTER FUNCTION factory_private.report_build(text,jsonb,date) RENAME TO report_build_before_cash_ledger;

CREATE FUNCTION factory_private.report_cash_ledger(p_filters jsonb,p_asof date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE
 ds date:=coalesce((p_filters->>'start_date')::date,p_asof-(coalesce((p_filters->>'period')::int,30)-1));
 de date:=coalesce((p_filters->>'end_date')::date,p_asof);
 daily_rows jsonb; currency_groups jsonb; monthly_rows jsonb; totals jsonb;
 unknown_currency boolean; scope_invalid_count bigint; scope_movement_count bigint;
BEGIN
 IF ds>de OR de>p_asof THEN RAISE EXCEPTION 'MCP_INPUT_INVALID'; END IF;
 -- The server materializes every qualifying ledger row before snapshot pagination.
 WITH entries AS (
  SELECT f.id,f.transaction_date date,f.amount,
   nullif(upper(btrim(t.currency)),'') currency,
   CASE WHEN t.id IS NULL THEN 'unassigned'
    WHEN nullif(btrim(t.currency),'') IS NULL THEN 'unknown:'||t.id
    ELSE 'currency:'||upper(btrim(t.currency)) END currency_key,
   CASE WHEN f.transaction_type::text='transfer' THEN
     CASE f.category WHEN 'transfer_in' THEN 'in' WHEN 'transfer_out' THEN 'out' END
    WHEN f.transaction_type::text='income' AND f.category IS DISTINCT FROM 'transfer_out' THEN 'in'
    WHEN f.transaction_type::text='expense' AND f.category IS DISTINCT FROM 'transfer_in' THEN 'out' END direction,
   coalesce(f.category IN('transfer_in','transfer_out'),false) transfer
  FROM financial_transactions f LEFT JOIN treasuries t ON t.id=f.treasury_id
  WHERE f.transaction_date BETWEEN ds AND de
 ), reviewed AS (
  SELECT *,currency IS NOT NULL AND direction IS NOT NULL AND amount>0
   AND amount::text NOT IN('NaN','Infinity','-Infinity') valid FROM entries
 ), scope AS (
  SELECT coalesce(bool_or(currency IS NULL),false) unknown FROM reviewed
 ), daily AS (
  SELECT date,currency_key,currency,count(*) movement_count,count(*) FILTER(WHERE NOT valid OR valid IS NULL) invalid_count,
   coalesce(sum(amount) FILTER(WHERE valid AND direction='in'),0) incoming,
   coalesce(sum(amount) FILTER(WHERE valid AND direction='out'),0) outgoing,
   coalesce(sum(amount) FILTER(WHERE valid AND transfer AND direction='in'),0) transfer_in,
   coalesce(sum(amount) FILTER(WHERE valid AND transfer AND direction='out'),0) transfer_out,
   coalesce(sum(amount) FILTER(WHERE valid AND NOT transfer AND direction='in'),0) external_in,
   coalesce(sum(amount) FILTER(WHERE valid AND NOT transfer AND direction='out'),0) external_out
  FROM reviewed GROUP BY date,currency_key,currency
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'row_key',d.date||':'||d.currency_key,'name',coalesce(d.currency,d.currency_key)||' '||d.date,'date',d.date,
  'currency',d.currency,'currency_key',d.currency_key,'movement_count',d.movement_count,'invalid_count',d.invalid_count,
  'totals_available',d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown,
  'inflows',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.incoming::text END,
  'outflows',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.outgoing::text END,
  'net',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN (d.incoming-d.outgoing)::text END,
  'transfer_in',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.transfer_in::text END,
  'transfer_out',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.transfer_out::text END,
  'transfer_net',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN (d.transfer_in-d.transfer_out)::text END,
  'external_in',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.external_in::text END,
  'external_out',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN d.external_out::text END,
  'external_net',CASE WHEN d.invalid_count=0 AND d.currency IS NOT NULL AND NOT s.unknown THEN (d.external_in-d.external_out)::text END
 ) ORDER BY d.date,d.currency_key),'[]') INTO daily_rows FROM daily d CROSS JOIN scope s;

 -- Monetary strings preserve PostgreSQL numeric precision across the JSON boundary.
 WITH groups AS (
  SELECT j->>'currency_key' currency_key,j->>'currency' currency,
   sum((j->>'movement_count')::bigint) movement_count,sum((j->>'invalid_count')::bigint) invalid_count,
   bool_and((j->>'totals_available')::boolean) available,
   sum((j->>'inflows')::numeric) incoming,sum((j->>'outflows')::numeric) outgoing,
   sum((j->>'transfer_in')::numeric) transfer_in,sum((j->>'transfer_out')::numeric) transfer_out,
   sum((j->>'external_in')::numeric) external_in,sum((j->>'external_out')::numeric) external_out
  FROM jsonb_array_elements(daily_rows) j GROUP BY j->>'currency_key',j->>'currency'
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'currency_key',currency_key,'currency',currency,'movement_count',movement_count,'invalid_count',invalid_count,
  'totals_available',available,
  'inflows',CASE WHEN available THEN incoming::text END,'outflows',CASE WHEN available THEN outgoing::text END,
  'net',CASE WHEN available THEN (incoming-outgoing)::text END,
  'transfer_in',CASE WHEN available THEN transfer_in::text END,'transfer_out',CASE WHEN available THEN transfer_out::text END,
  'transfer_net',CASE WHEN available THEN (transfer_in-transfer_out)::text END,
  'external_in',CASE WHEN available THEN external_in::text END,'external_out',CASE WHEN available THEN external_out::text END,
  'external_net',CASE WHEN available THEN (external_in-external_out)::text END
 ) ORDER BY currency_key),'[]') INTO currency_groups FROM groups;

 WITH months AS (
  SELECT left(j->>'date',7) AS month,j->>'currency_key' currency_key,j->>'currency' currency,
   bool_and((j->>'totals_available')::boolean) available,
   sum((j->>'movement_count')::bigint) movement_count,sum((j->>'invalid_count')::bigint) invalid_count,
   sum((j->>'inflows')::numeric) incoming,sum((j->>'outflows')::numeric) outgoing,
   sum((j->>'transfer_in')::numeric) transfer_in,sum((j->>'transfer_out')::numeric) transfer_out,
   sum((j->>'external_in')::numeric) external_in,sum((j->>'external_out')::numeric) external_out
  FROM jsonb_array_elements(daily_rows) j GROUP BY left(j->>'date',7),j->>'currency_key',j->>'currency'
 ) SELECT coalesce(jsonb_agg(jsonb_build_object(
  'month',month,'currency_key',currency_key,'currency',currency,'movement_count',movement_count,'invalid_count',invalid_count,
  'totals_available',available,'inflows',CASE WHEN available THEN incoming::text END,'outflows',CASE WHEN available THEN outgoing::text END,
  'net',CASE WHEN available THEN (incoming-outgoing)::text END,
  'transfer_in',CASE WHEN available THEN transfer_in::text END,'transfer_out',CASE WHEN available THEN transfer_out::text END,
  'transfer_net',CASE WHEN available THEN (transfer_in-transfer_out)::text END,
  'external_in',CASE WHEN available THEN external_in::text END,'external_out',CASE WHEN available THEN external_out::text END,
  'external_net',CASE WHEN available THEN (external_in-external_out)::text END
 ) ORDER BY month,currency_key),'[]') INTO monthly_rows FROM months;

 SELECT coalesce(sum((j->>'invalid_count')::bigint),0),coalesce(sum((j->>'movement_count')::bigint),0),
  coalesce(bool_or(j->>'currency' IS NULL),false)
 INTO scope_invalid_count,scope_movement_count,unknown_currency FROM jsonb_array_elements(currency_groups) j;
 IF jsonb_array_length(currency_groups)=1 AND (currency_groups->0->>'totals_available')::boolean THEN
  totals:=currency_groups->0;
 ELSE
  totals:=jsonb_build_object('currency',NULL,'totals_available',false,'inflows',NULL,'outflows',NULL,'net',NULL,
   'transfer_in',NULL,'transfer_out',NULL,'transfer_net',NULL,'external_in',NULL,'external_out',NULL,'external_net',NULL);
 END IF;
 RETURN jsonb_build_object('rows',daily_rows,'summary',totals||jsonb_build_object(
  'row_count',jsonb_array_length(daily_rows),'movement_count',scope_movement_count,'invalid_count',scope_invalid_count,
  'unknown_currency',unknown_currency,'currency_groups',currency_groups,'monthly',monthly_rows,
  'unavailable_reason',CASE WHEN scope_movement_count=0 THEN 'no_ledger_movements' WHEN unknown_currency THEN 'unknown_currency'
   WHEN jsonb_array_length(currency_groups)>1 THEN 'multiple_currencies' WHEN scope_invalid_count>0 THEN 'invalid_ledger_entries' END),
  'calculation_basis',jsonb_build_object('source','financial_transactions','calculation_version',2,
   'start_date',ds,'end_date',de,'as_of',p_asof,'complete_input_set',true,'current_balances',false,
   'cash_basis','native ledger transaction_date; each recorded movement counted once; no invoice paid_amount added',
   'currency','per treasury currency, normalized; no conversion or mixed-currency total',
   'transfers','recorded inflows/outflows include transfers; transfer and external components are separate',
   'rows','daily currency groups for dates with ledger movements; monetary values are exact decimal strings',
   'invalid_entries','unknown currency blocks all totals; other invalid entries block their currency aggregate',
   'snapshot','existing actor/client/resource-bound snapshot retained; old snapshots retain their disclosed calculation basis'));
END $body$;

CREATE FUNCTION factory_private.report_build(p_report text,p_filters jsonb,p_asof date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
BEGIN
 IF p_report='cash_flow' THEN RETURN factory_private.report_cash_ledger(p_filters,p_asof); END IF;
 RETURN factory_private.report_build_before_cash_ledger(p_report,p_filters,p_asof);
END $body$;

REVOKE ALL ON FUNCTION factory_private.report_cash_ledger(jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
REVOKE ALL ON FUNCTION factory_private.report_build(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
REVOKE ALL ON FUNCTION factory_private.report_build_before_cash_ledger(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
COMMIT;
