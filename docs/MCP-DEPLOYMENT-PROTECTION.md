# MCP deployment protection

Deploy the application and MCP from the same main commit. Do not publish an
older application-only commit to the production alias. The endpoint, discovery,
consent route, isolated runtime dependencies and bundled CA are part of the
application release.

`npm run build` now starts `scripts/check-mcp-deployment.mjs`. The same preflight
runs before the application build through `vercel.json` and the Vercel project
build command: `node scripts/check-mcp-deployment.mjs && npm run build`.
The project-level command also fails when an older commit lacks the checker.
No GitHub Actions workflow is added or dispatched.

Run the lightweight check locally with `npm run mcp:check-deployment`.
Run its regression cases with `node --test mcp/tests/deployment.test.mjs`.
It checks required files, dependency lock agreement, function CA inclusion and
certificate identity/expiry, discovery rewrites, API exclusion from the SPA
fallback, and the application consent route. It needs no credentials, environment
file, database or network. A missing handler produces ENOENT; other contract
violations fail with an assertion explaining which part of the release changed.
Fix the release tree/configuration instead of bypassing the check.

Keep the current production OAuth resource, issuer, approved client, gateway
secret and write flag when deploying. This guard does not read or change those
settings and does not prove live authentication, business commands or HTTP/WS
token rejection. Confirm the live connector context and a bounded read after
deployment. Protected user administration remains a native handoff.

The guard stops the covered accidental packaging/routing regressions. It cannot
prevent an administrator changing the project build command, intentionally
removing both guards, a provider outage, or credentials expiring. Review such
changes before deployment. For rollback, reassign the production alias to the
previous known-good deployment; do not revert database migrations or erase
business receipts. If access must stop, close the existing owner/client policy.

Pre-integration fallback: deployment `dpl_7DgnbyCBB7y9fZGSMvBF58WwksT8`,
commit `093e9cdb2c7926f37a625e9e35d6a1bc03611307`. It contains MCP and the
approved write configuration but predates this build guard.
