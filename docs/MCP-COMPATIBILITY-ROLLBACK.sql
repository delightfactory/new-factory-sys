-- LOCAL REVIEW ONLY. Operator-approved recovery of migration 5 native API.
-- Stop MCP traffic / provider issuance as required by MCP-NATIVE-ROLLBACK.sql
-- before removing Auth hooks. Coordinate frontend rollback; retain business
-- rows, private legacy functions, audit evidence and all idempotency receipts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DROP TRIGGER IF EXISTS native_financial_client ON public.financial_transactions;
DO $$ DECLARE original record; privilege jsonb; BEGIN
 FOR original IN SELECT * FROM factory_private.native_rpc_originals LOOP
  EXECUTE original.definition;
  EXECUTE format('ALTER FUNCTION %s OWNER TO %I',original.identity,original.owner_name);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,factory_mcp_gateway',original.identity);
  FOR privilege IN SELECT value FROM jsonb_array_elements(original.privileges) LOOP
   EXECUTE format('GRANT %s ON FUNCTION %s TO %s%s',privilege->>'privilege',original.identity,
    CASE WHEN privilege->>'grantee'='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(privilege->>'grantee') END,
    CASE WHEN (privilege->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.factory_native_write(text,jsonb,uuid),public.factory_native_financial_reversal_plan(bigint)
 FROM PUBLIC,anon,authenticated,factory_mcp_gateway;
REVOKE ALL ON FUNCTION factory_private.native_identity(),factory_private.native_role(text) FROM authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
