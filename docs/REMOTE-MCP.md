# Factory remote MCP — local review candidate 0.2.0

Not deployed. [Checkpoint](MCP-CHECKPOINT.md) lists remaining work; [validation](REMOTE-MCP-VALIDATION.md) scopes evidence.

Current activation proposal: one permanent, revocable connection with explicit read/write consent and default-closed FACTORY_MCP_WRITES_ENABLED until live read/Auth/isolation gates pass. See MCP-ACTIVATION-APPROVAL.md and MCP-ROLLBACK-AND-COMPATIBILITY.md. Persistent policy may use PostgreSQL infinity; JWTs keep provider expiry and refresh/revocation checks. Historical receipt identity survives native deletion; consent provenance does not block provider session cleanup. No live setup executed.

Runtime validates asymmetric JWT, exact issuer/resource, approved client, real user/session, isolated resource role and identity scopes. Incoming token never goes to Data API. Restricted database gateway uses five fixed parameterized RPC paths: context, query, write, schema and analyze, with real current profile role and expiring access. OAuth migration adds live provider consent/client fingerprint/native consent admission. Queries use repeatable read; commands preserve stock/cost formulas and locked transitions.

MCP and ten native service modules share factory_write. Receipt binds user/request UUID/action/payload/client; retry conflict cannot duplicate intent. Browser sessionStorage stores intent hash+UUID only. Catalog defines 69 tools: 54 commands, 12 extended reads (including schema/analyze) and 3 foundation reads. Covers masters/recipes/bundles, commercial invoices/returns, order transitions, stocktake, internal accounting/settlement/treasury ledger transfer, 18 reports and protected admin handoff. No general SQL, service role, password or real bank-transfer capability. Tool count does not prove complete UI parity; see MCP-CAPABILITY-MATRIX.md and MCP-FINAL-REVIEW.md.

fulfill_packaging_order produces the actual semi-finished shortage then completes packaging in one transaction, with phase operation numbers and all-phase rollback. Completed bundle reversal is unsupported by the existing app.

Local files: api/mcp.js and oauth-resource.js; mcp server/auth/runtime/catalog/tools; src/services/FactoryCommandsService.ts and ten service modules; protected src/pages/auth/FactoryOAuthConsent.tsx; four 20261009 migrations. Missing config fails closed. mcp/.env.example contains names/placeholders; never reuse Opal credentials or grants. Consent requires approved exact VITE_MCP_APP_ORIGIN.

Later approved connection step: reconfirm hosted Auth catalog/staging; approve exact HTTPS callback/resource; register one public PKCE authorization-code client with dynamic registration closed; approve expiring static policy/per-user access; provide restricted database login and runtime config through approved secret channel; enable/test hook/consent. Never grant resource role to PostgREST authenticator. Prove native/SDK journeys, refresh/revocation, REST/RPC/Storage/Realtime rejection and concurrency before production. Earlier dashboard inspection showed OAuth disabled; current provider settings still require owner verification. No production deployment authorized this round.


Structured analytics: factory_schema/factory_analyze in mcp/analytics.mjs and migration20261009161500. Native permissions/RLS, read-only repeatable-read, curated metadata and typed expressions; no generalSQL. Latest evidence/remaining work: MCP-CHECKPOINT.md.
