-- Removes only the exact reviewed guard. Category rows are never changed.
BEGIN;
DO $rollback$ DECLARE target oid:=to_regprocedure('factory_private.protect_financial_category_history()'); BEGIN
 IF current_user <> 'postgres' OR target IS NULL OR NOT EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
  WHERE p.oid=target AND p.proowner='postgres'::regrole AND p.prorettype='trigger'::regtype
  AND l.lanname='plpgsql' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, public, pg_temp']
  AND md5(replace(p.prosrc,chr(13),''))='379a59f0c56b4f0bf61c93f832e75754'
 ) OR EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=target AND a.grantee<>p.proowner)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.financial_categories'::regclass AND t.tgname='protect_financial_category_history' AND t.tgfoid=target AND t.tgtype=11 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgqual IS NULL AND t.tgnargs=0)
 OR (SELECT count(*) FROM pg_trigger WHERE tgfoid=target)<>1 THEN
  RAISE EXCEPTION 'CATEGORY_GUARD_ROLLBACK_DRIFT';
 END IF;
END $rollback$;
DROP TRIGGER protect_financial_category_history ON public.financial_categories;
DROP FUNCTION factory_private.protect_financial_category_history();
COMMIT;
