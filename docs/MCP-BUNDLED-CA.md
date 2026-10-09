# Bundled database TLS certificate

The restricted MCP database connection now loads the public Supabase Root 2021
CA from `mcp/certs/supabase-root-2021.crt` by default, relative to `runtime.mjs`.
`vercel.json` explicitly includes that file in the `api/mcp.js` function artifact.
It is outside the frontend public directory and does not change browser trust,
native application Auth, operating-system trust, or JWT signing keys.

Source, re-downloaded over verified HTTPS on 2026-10-09:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

File SHA-256:
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
The root is self-signed, has CA=true, and expires on 2031-04-26.

The runtime keeps `rejectUnauthorized: true`. The existing optional override is
`FACTORY_MCP_DATABASE_CA_FILE`; leave it unset for this deployment so the bundled
certificate is resolved independently of the process working directory. If an
override is needed later, it must name a file on the server. An owner's Windows
path is not available inside Vercel. A missing override fails closed.

Owner-only Production secret template (replace the placeholder privately with
the URL-encoded **gateway** password, not the postgres password):

```text
FACTORY_MCP_DATABASE_URL=postgresql://factory_mcp_gateway.cgqunqczuvwfvuzlsvyy:[URL_ENCODED_GATEWAY_PASSWORD]@aws-1-eu-west-2.pooler.supabase.com:6543/postgres
```

Do not append sslmode or other URL parameters; the reviewed configuration
validator rejects them. TLS is configured on the pg connection itself.

Validation for this change:

- `node --test --test-concurrency=1 mcp/tests/runtime.test.mjs mcp/tests/transport.test.mjs`: 6/6 pass; synthetic credentials only.
- Actual `@vercel/node` 5.8.17 local builder emitted Node 24 functions; the emitted MCP runtime loaded the CA with the same SHA-256 and verified TLS enabled. The emitted SDK/HTTP checks passed. No account, CLI login, production deployment, or database connection was used.
- Public pooler port 6543 accepted TLSv1.3 with certificate verification enabled and the bundled root. Only PostgreSQL SSLRequest was sent; no StartupMessage, user, password, or application query was sent.
- Application production build: see `mcp-ca-build.txt`.

Evidence: `mcp-ca-targeted.txt`, `mcp-ca-vercel.txt`, `mcp-ca-build.txt`.
The older 96-test report belongs to the prior release and is not claimed for
this change. Live MCP initialize/read/OAuth isolation gates remain pending
owner secret-save confirmation and a separately authorized deployment.
`FACTORY_MCP_WRITES_ENABLED` remains false.
