# Factory access reconciliation — 2026-10-09

The earlier finding combined project metadata, read-only catalog SQL and a signed-in Supabase dashboard. The supported metadata/SQL path remains available now. Ahmed subsequently reconnected Supabase to the correct organization (reported16:18UTC). No factory access refusal was inferred from enumeration.

Before reconnection list_projects enumerated two other projects, while direct known-ID calls still succeeded. After the owner reconnection list_projects now lists new-factory-sys in organizationpchajhscmbfswwvgeifl. The visibility blocker is resolved; no user reconnection request remains. Direct get_project(cgqunqczuvwfvuzlsvyy) succeeded: new-factory-sys, organizationpchajhscmbfswwvgeifl, eu-west-2, ACTIVE_HEALTHY, PostgreSQL17.6.1.054. Direct read-only execute_sql and list_branches succeeded; branches[]. No actual factory-project access denial occurred in these calls.

Read-only live catalog confirmed expected Auth sessions/oauth_clients/oauth_authorizations/oauth_consents fields, enum labels and client-fingerprint-column presence (boolean only, not its contents). Registered OAuth client count0. Existing approved Ahmed identity983f9ec7-eb91-4e75-b589-af261f4db8ca remains activeadmin; no elevation proposed.

Authenticated and authenticator are NOSUPERUSER/NOBYPASSRLS. Factory MCP roles remain absent. Sample sales/production/party/finance/raw tables have authenticatedSELECT and RLS disabled. This preserves the existing native policy, not proof of row isolation. Analyzer discloses actual source_rls flags and applies real role domain gates; no source policies/grants broadened.

Browser inventory now contains no Supabase dashboard tab. The previously inspected dashboard configuration (OAuthdisabled/legacy signing/no clients) has not been reverified in a dashboard this final round. Public discovery lookup through the web tool was unavailable; this is a lookup limitation, not a factory account denial. No alternative private token or secret-file route used. The earlier environment-file read rejected by approval review was not retried.

No credentials, roleLOGIN changes, client/policy rows, OAuthgrants, signing changes, migrations or deployment performed live. Revalidate provider settings with the owner before activation.

After reconnection, all31curated analytical tables and281columns match live names/types, with0missing/0type mismatches. Exact normalized bodies of live complete_production_order_atomic and complete_packaging_order_atomic match the reviewed202601WACO source baselines. Their bigint→void signatures and authenticatedEXECUTE match the shared SQL expectations. Replacement process_sales_invoice bigint→jsonb signature also matches. No cost-rule drift found in this comparison; no live RPC executed. See MCP-LIVE-SCHEMA-CHECK.json.

All31curated tables already grant native authenticated SELECT and none is owned by an authenticated-member role. RLS is enabled on4of31; no table grant or policy was added. Exact live flags are disclosed; this is an existing configuration finding, not a proved exploitation path.
