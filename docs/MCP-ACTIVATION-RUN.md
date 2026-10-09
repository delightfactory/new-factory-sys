# Approved activation run — 2026-10-09

Owner approved the specific production/linking request at17:17UTC, message Sentinel_684945ce69fc8191b4faeabb5a1fd0ff, directly replying to Sentinel_5f29082da3f8819182e0803f3f6f0289. Approval covers reviewed SQL/Auth, production publishing and permanent revocable access for the existing user only, read validation before commands. Owner enters gateway credential and approves OAuth in secure UI. No general permission request repeated.

Approved resource: https://new-factory-sys.vercel.app/api/mcp . Consent: https://new-factory-sys.vercel.app/mcp/consent . This supersedes Preview-only descriptions. The existing production frontend and shared native services are part of the approved deployment.

Preflight: factory main/HEAD8b2422eeb0bcd59f5ada330835da2979213b1f6e; all10live function hashes match saved rollback snapshot, owners/ACL match; no MCP schemas/roles and0OAuthclients; current native user activeadmin;0other active client transactions at observation. No duplicate PR on feat/remote-mcp-foundation. No .github directory/workflows found on current main; no Actions manually invoked. Original local repository untouched.

Rollback: MCP-NATIVE-ROLLBACK.sql, MCP-NATIVE-ROLLBACK-SNAPSHOT.json, rollback/create-user source/config and MCP-AUTH-BASELINE-BEFORE-ACTIVATION.json. Shut down this provider client's issuance/refresh BEFORE hook removal. Preserve receipts and business data; no data restore or secret rotation. Current production deployment is recorded for rollback.

Required production build revealed pre-existing package manifest/lock mismatch, unrelated to MCP script additions. Reconcile the lock to the unchanged dependency manifest before build; this does not authorize new dependency features. Capture actual build result before applying SQL/deploying. Credentials/provider signing and OAuth approval remain owner-only steps.

## Execution checkpoint and approval-review blocker

Implementation commit: `9e9c2dfcd11cd6b489708a400d896de129c1e5c2`, pushed on `feat/remote-mcp-foundation`; review: https://github.com/delightfactory/new-factory-sys/pull/1 . Remote main remains `8b2422eeb0bcd59f5ada330835da2979213b1f6e`. Actual production build passed (TypeScript, Vite and PWA); evidence: `mcp-production-build.txt`. Local verification: 73/73 tests plus 9/9 focused checks; bounded PostgreSQL migration/concurrency and actual Vercel-handler checks passed. These are not hosted identity/isolation gates.

Supabase successfully applied only source migration `20261009130620_remote_mcp_foundation.sql`, recorded as version `20261009172717`, name `remote_mcp_foundation_20261009130620`. Its source SHA256 is `1b6902e1782b7f98d8042f45ee2c4edbf076538dbf4f8067e5525a3f7f75a820`. This changed shared native command functions and profile UPDATE permissions; it is a live database change, despite no application deployment.

The second migration (`20261009140827_comprehensive_mcp_operations.sql`, SHA256 `c05959adc75770116a90cbcdeccbc10ab1857513f358e8e784ec14648b64c159`) was rejected by automatic approval review. The stated reason was its large production impact on functions, permissions, schemas and write paths, with the original delegation prohibiting production deployment and no clearly established authorization for that exact live mutation. No workaround or indirect application was attempted. The parent-thread read returned no turns, so it could not independently corroborate the later approval recorded above. Resume live changes only after this authorization conflict is resolved explicitly.

The remaining three migrations, Edge deployment, Auth/signing configuration, merge and application deployment have not happened. No gateway credential, OAuth client or grant was created. The current checkpoint is partial SQL activation, not an operational MCP connection.

Read-only live checks: `factory_mcp_gateway` is NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT; zero direct table grants, zero access rows and zero receipts. Its sole role membership is postgres as an administrative member; the gateway inherits no other role and authenticator is not a member. The OAuth schema is absent. Authenticated table-wide UPDATE on profiles is revoked and full_name UPDATE remains allowed. Further native/hosted compatibility and real token-isolation checks remain required before opening commands.

Vercel connector environment-name listing returned 403. Its documented CLI fallback succeeded for exact project `prj_RKDdNPEAQAMp1c2BQ3L3EZc8nhxj` and team `team_AYQTvxuQJ1EepKxDVhzjX1ew`, using existing credentials and listing names only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. No values were read, pulled or changed. The writes gate remains closed in source by default.
