-- Revert only this reviewed profit wrapper; no data/snapshot changes.

BEGIN;

DO $guard$ BEGIN

 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_legacy_context(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='945c267ebdd56e799725d736a16743f7' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp','factory.profit_legacy=on'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_legacy_context(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_totals(jsonb)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='afd072899bf9c0fc49db43d59e1934e1' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='i' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_totals(jsonb)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_days(date,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='8fbcee5d35954f14c7b7d36505bff46c' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_days(date,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_profit_cash_values(jsonb,jsonb)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='82a7a4c9c29316b7d43794c60b6e526e' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='i' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_profit_cash_values(jsonb,jsonb)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='f933ee08c963c19d59551906e2cda8b2' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build_before_profit_ledger(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='ca6297d81e65595fa67e2db3d950f696' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build_before_profit_ledger(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_build_before_cash_ledger(text,jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='fcfcfffbff25223c25e6d0b9fa78fddb' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_build_before_cash_ledger(text,jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_cash_ledger(jsonb,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='1b9875129e279a876e875aa262aaa540' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='plpgsql' AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_cash_ledger(jsonb,date)';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('factory_private.report_pnl(date,date)') AND md5(replace(p.prosrc,E'\r\n',E'\n'))='733c53418f7a54d26df95f437909bb65' AND p.proowner='postgres'::regrole AND p.prosecdef AND p.prorettype='jsonb'::regtype AND l.lanname='sql' AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner))THEN RAISE EXCEPTION 'PROFIT_LEDGER_ROLLBACK_DRIFT: report_pnl(date,date)';END IF;

END $guard$;

DROP FUNCTION factory_private.report_build(text,jsonb,date);

DROP FUNCTION factory_private.report_profit_legacy_context(text,jsonb,date);

DROP FUNCTION factory_private.report_profit_days(date,date);

DROP FUNCTION factory_private.report_profit_cash_values(jsonb,jsonb);

DROP FUNCTION factory_private.report_profit_totals(jsonb);

ALTER FUNCTION factory_private.report_build_before_profit_ledger(text,jsonb,date) RENAME TO report_build;

COMMIT;
