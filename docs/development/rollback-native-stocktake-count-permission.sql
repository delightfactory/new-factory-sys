-- Restore the captured pre-fix stocktake role function only after dependent document-edit rollback.
-- Release candidate only; no production application approved.
BEGIN;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='factory_private.native_role(text)'::regprocedure AND md5(pg_get_functiondef(p.oid))='30adc9bad406d7bdf18e34f7eb617e24' AND p.proowner='postgres'::regrole AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')THEN RAISE EXCEPTION 'STOCKTAKE_ROLE_ROLLBACK_DRIFT';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION factory_private.native_role(p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
 IF p_action ~ '^(create|update|edit)_(raw_material|packaging_material|semi_finished_product|finished_product|bundle)$'
   OR p_action='adjust_inventory' OR p_action ~ '^(create|start|record|reconcile|cancel)_stocktake$' THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','inventory_officer']);
 ELSIF p_action ~ '^(create|start|complete|cancel)_(production|packaging|bundle_assembly)_order$'
   OR p_action IN ('fulfill_packaging_order','complete_packaging_order_allow_shortage') THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','production_officer']);
 ELSIF p_action ~ '^(create|post|void)_(sales|purchase)_(invoice|return)$'
   OR p_action ~ '^(create|update)_(party|treasury|financial_category)$'
   OR p_action IN ('record_financial_transaction','transfer_treasury','delete_financial_transaction') THEN
  PERFORM factory_private.require_role(ARRAY['admin','manager','accountant']);
 ELSIF p_action='rename_user' THEN PERFORM factory_private.require_role(ARRAY['admin']);
 ELSE RAISE EXCEPTION 'MCP_TOOL_UNKNOWN'; END IF;
END $function$;
COMMIT;
