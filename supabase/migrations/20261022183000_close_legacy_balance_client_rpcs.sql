-- LOCAL CANDIDATE ONLY. No production application or release approved.
-- These legacy SECURITY DEFINER RPCs bypass native receipt/ledger commands.
-- Current captured frontend/MCP/SQL functions contain no callers.
-- Only PUBLIC/anon/authenticated EXECUTE is removed; owner/service kept.
DO $candidate$
DECLARE function_name text; expected_body text; function_oid oid;
BEGIN
    FOREACH function_name IN ARRAY ARRAY['decrement_treasury_balance','increment_treasury_balance'] LOOP
        function_oid:=to_regprocedure('public.'||function_name||'(bigint,numeric)');
        expected_body:=CASE function_name
            WHEN 'decrement_treasury_balance' THEN '1b6915d31833728e729e5675d6a01d2d'
            ELSE 'e5011b93ee99d6d1042013fd08d41b11' END;
        IF function_oid IS NULL OR md5(pg_get_functiondef(function_oid))<>expected_body THEN
            RAISE EXCEPTION 'LEGACY_BALANCE_RPC_BODY_CHANGED';
        END IF;
        IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=function_oid AND
            (p.proowner<>'postgres'::regrole OR NOT p.prosecdef OR
             (SELECT count(*) FROM aclexplode(p.proacl))<>5 OR
             EXISTS(SELECT 1 FROM aclexplode(p.proacl)a WHERE a.grantor<>'postgres'::regrole OR a.is_grantable OR a.privilege_type<>'EXECUTE' OR a.grantee NOT IN(0,'postgres'::regrole,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)))) THEN
            RAISE EXCEPTION 'LEGACY_BALANCE_RPC_GRANTS_CHANGED';
        END IF;
    END LOOP;
    REVOKE EXECUTE ON FUNCTION public.decrement_treasury_balance(bigint,numeric) FROM PUBLIC,anon,authenticated;
    REVOKE EXECUTE ON FUNCTION public.increment_treasury_balance(bigint,numeric) FROM PUBLIC,anon,authenticated;
END;
$candidate$;
