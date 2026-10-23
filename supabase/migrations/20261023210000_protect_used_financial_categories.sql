-- Local candidate only: protect existing financial classifications from deletion.
-- Unused system rows remain deletable by existing reset/restore flows.
-- No write-path/table lock or category adoption. Concurrent later movements can
-- still use a removed name; they remain visible as unconfigured diagnostics.
BEGIN;
DO $preflight$ BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'CATEGORY_GUARD_OWNER_REQUIRED'; END IF;
 IF to_regprocedure('factory_private.protect_financial_category_history()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.financial_categories'::regclass AND tgname='protect_financial_category_history') THEN
  RAISE EXCEPTION 'CATEGORY_GUARD_TARGET_EXISTS';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='factory_private' AND nspowner='postgres'::regrole)
 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
 ((table_name='financial_categories' AND (column_name,data_type) IN (('name','text'),('type','text'),('is_system','boolean')))
 OR (table_name='financial_transactions' AND (column_name,data_type) IN (('category','text'),('transaction_type','text'))))) <> 5 THEN
  RAISE EXCEPTION 'CATEGORY_GUARD_SCHEMA_DRIFT';
 END IF;
END $preflight$;
CREATE FUNCTION factory_private.protect_financial_category_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM public.financial_transactions f WHERE f.transaction_type=OLD.type AND f.category=OLD.name) THEN
  RAISE EXCEPTION 'MCP_CATEGORY_IN_USE';
 END IF;
 RETURN OLD;
END
$guard$;
REVOKE ALL ON FUNCTION factory_private.protect_financial_category_history() FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
DO $acl$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid='factory_private.protect_financial_category_history()'::regprocedure AND a.grantee<>p.proowner) THEN
  RAISE EXCEPTION 'CATEGORY_GUARD_UNEXPECTED_FUNCTION_GRANT';
 END IF;
END $acl$;
CREATE TRIGGER protect_financial_category_history BEFORE DELETE ON public.financial_categories
FOR EACH ROW EXECUTE FUNCTION factory_private.protect_financial_category_history();
COMMIT;
