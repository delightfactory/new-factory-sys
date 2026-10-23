-- Candidate rollback only. No business rows are changed or removed.
BEGIN;

DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('factory_private.report_build(text,jsonb,date)')
  AND md5(replace(p.prosrc,E'\r\n',E'\n'))='ca6297d81e65595fa67e2db3d950f696' AND pg_get_userbyid(p.proowner)='postgres'
  AND p.prosecdef AND p.prorettype='jsonb'::regtype AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))
 THEN RAISE EXCEPTION 'CASH_LEDGER_DEFINITION_DRIFT: factory_private.report_build(text,jsonb,date)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('factory_private.report_cash_ledger(jsonb,date)')
  AND md5(replace(p.prosrc,E'\r\n',E'\n'))='1b9875129e279a876e875aa262aaa540' AND pg_get_userbyid(p.proowner)='postgres'
  AND p.prosecdef AND p.prorettype='jsonb'::regtype AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))
 THEN RAISE EXCEPTION 'CASH_LEDGER_DEFINITION_DRIFT: factory_private.report_cash_ledger(jsonb,date)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('factory_private.report_build_before_cash_ledger(text,jsonb,date)')
  AND md5(replace(p.prosrc,E'\r\n',E'\n'))='fcfcfffbff25223c25e6d0b9fa78fddb' AND pg_get_userbyid(p.proowner)='postgres'
  AND p.prosecdef AND p.prorettype='jsonb'::regtype AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  AND p.proconfig=ARRAY['search_path=public, pg_temp']::text[]
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))
 THEN RAISE EXCEPTION 'CASH_LEDGER_DEFINITION_DRIFT: factory_private.report_build_before_cash_ledger(text,jsonb,date)'; END IF;
END $guard$;
DROP FUNCTION factory_private.report_build(text,jsonb,date);
ALTER FUNCTION factory_private.report_build_before_cash_ledger(text,jsonb,date) RENAME TO report_build;
DROP FUNCTION factory_private.report_cash_ledger(jsonb,date);
REVOKE ALL ON FUNCTION factory_private.report_build(text,jsonb,date) FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
COMMIT;
