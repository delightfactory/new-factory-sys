# Approved activation run — 2026-10-09

Owner approved the specific production/linking request at17:17UTC, message Sentinel_684945ce69fc8191b4faeabb5a1fd0ff, directly replying to Sentinel_5f29082da3f8819182e0803f3f6f0289. Approval covers reviewed SQL/Auth, production publishing and permanent revocable access for the existing user only, read validation before commands. Owner enters gateway credential and approves OAuth in secure UI. No general permission request repeated.

Approved resource: https://new-factory-sys.vercel.app/api/mcp . Consent: https://new-factory-sys.vercel.app/mcp/consent . This supersedes Preview-only descriptions. The existing production frontend and shared native services are part of the approved deployment.

Preflight: factory main/HEAD8b2422eeb0bcd59f5ada330835da2979213b1f6e; all10live function hashes match saved rollback snapshot, owners/ACL match; no MCP schemas/roles and0OAuthclients; current native user activeadmin;0other active client transactions at observation. No duplicate PR on feat/remote-mcp-foundation. No .github directory/workflows found on current main; no Actions manually invoked. Original local repository untouched.

Rollback: MCP-NATIVE-ROLLBACK.sql, MCP-NATIVE-ROLLBACK-SNAPSHOT.json, rollback/create-user source/config and MCP-AUTH-BASELINE-BEFORE-ACTIVATION.json. Shut down this provider client's issuance/refresh BEFORE hook removal. Preserve receipts and business data; no data restore or secret rotation. Current production deployment is recorded for rollback.

Required production build revealed pre-existing package manifest/lock mismatch, unrelated to MCP script additions. Reconcile the lock to the unchanged dependency manifest before build; this does not authorize new dependency features. Capture actual build result before applying SQL/deploying. Credentials/provider signing and OAuth approval remain owner-only steps.
