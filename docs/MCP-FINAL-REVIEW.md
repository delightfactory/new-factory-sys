# Independent final source review - 2026-10-09

Workspace: `factory-mcp`; branch: `feat/remote-mcp-foundation`.
Base reference: `8b2422eeb0bcd59f5ada330835da2979213b1f6e`.

Verdict: **scoped PASS for reviewed source security and shared service boundaries**.
Complete UI/report semantic parity and hosted readiness are not established by
this review. The independent reviewer inspected source only, ran no tests or live
actions, and changed only this document, MCP-CAPABILITY-MATRIX.md and REMOTE-MCP.md
at the root agent's explicit request.

## Reviewed boundaries

- Ten modified native services and FactoryCommandsService use the shared gated
  write dispatcher. Normal native calls require a real active session and
  installed migrations, but no MCP environment or MCP access policy. Missing
  session/migration fails without a legacy write fallback.
- Native production, packaging and assembly order codes are preserved. MCP cannot
  override those native-only codes. Four MCP edit tools combine metadata/recipe
  and quantity/raw-material or packaging-material cost adjustment atomically,
  require a reason, and preserve system-owned derived costs.
- Manual financial deletion now uses a locked atomic dispatcher. Linked
  party/invoice and transfer deletions are blocked for reversal review; protected
  handoffs return a target and native route without performing the action.
- Analytical SQL uses curated tables, typed fields, fixed relationships and
  reviewed expressions, with parameter-bound values. SELECT executes as
  authenticated with nonowner/non-BYPASS checks and row_security=on inside READ
  ONLY REPEATABLE READ. Existing table grants and source policies apply; results
  disclose each selected table's actual RLS enablement.
- Verified JWT subject/session/client/resource/scope are retained in trusted
  gateway-local claims. Incoming resource tokens are not forwarded to Data API.
  OAuth checks provider consent, client fingerprint, admission and expiring
  business access; no live installation or grant is implied.

No concrete SQL injection or analytical RLS bypass was found in the source
reviewed. Previous order-code, manual-delete and nonfinite recipe-quantity
findings were corrected in the inspected source.

## Verification supplied by the root agent

The root agent reports these latest local gates; this independent reviewer did
not rerun them and does not infer hosted behavior from their results:

| Gate | Latest reported result | Limit |
|---|---|---|
| Serial full suite | 62 pass / 0 fail, 13.678 seconds | Local test environment |
| Actual PostgreSQL 17 | PASS | Local database; synthetic identity/OAuth data |
| Vercel verification | PASS | Local build/handler verification; no live deployment |

## Remaining limits and release blockers

- The catalog contains 69 tools: 54 commands, 12 extended reads including
  schema/analyze, and 3 foundation reads. Five fixed RPC paths are context, query,
  write, schema and analyze. Counts do not prove capability or semantic parity.
- Analytics cannot compare a field with another field. Direct unpaid-invoice
  filtering by paid_amount < total_amount remains unsupported; consume all
  applicable pages and compare client-side, or add a fixed predicate. Other P
  entries in MCP-CAPABILITY-MATRIX.md remain pending.
- Analytical calls share a repeatable-read snapshot only within a request. Later
  offset pages use a fresh snapshot. One-to-many joins preserve SQL multiplicity
  and may repeat invoice-header amounts; returned warnings describe this.
- Ten native services have source integration, not ten independent browser
  proofs. Representative production/consent browser journeys and remaining report
  parity checks are still required for comprehensive acceptance.
- Hosted Auth refresh/signing/provider behavior, policy configuration, database
  TLS, and rejection of issued MCP tokens by REST/RPC/Storage/Realtime remain
  unverified. A confirmed staging target and exact approval for live
  SQL/Auth/client/access setup are required before those checks. No credentials,
  OAuth grants, live migrations or production deployment were created by this
  review.

## Hosted access clarification supplied by the root agent

The root agent reports that get_project, read-only catalog SQL and list_branches
succeeded for factory project `cgqunqczuvwfvuzlsvyy` (`new-factory-sys`) in
organization `pchajhscmbfswwvgeifl`, despite list_projects omitting that project.
The project is healthy on PostgreSQL 17, the previously approved Ahmed user
remains an active admin, and branches are empty. There is no confirmed access
denial. Secret-column presence was checked as a boolean only and OAuth client
count was zero; provider/signing configuration was not freshly verified. These
are root-supplied observations, not live actions performed by this reviewer.

This is a reviewable local candidate, not approval to deploy production.

Root later reconfirmed after owner Supabase reconnection: list_projects now includes factory;31tables/281columns match live metadata,0missing/0type mismatch, normalized atomicproduction/packaging WACObodies match source. This is root read-only evidence, not another independent reviewer run.

Independent review of activation proposal: scopedPASS after correcting expiry wording to at most60minutes from initial policy activation with a hard recordedUTCdeadline; consent/token cannot extend it. LiveDB/nativeSQL effects, owner-only credential/consent, no businesswrites/productiondeploy are explicitly disclosed.

The preceding 60-minute proposal is superseded. Follow-up source review of permanent policy expiry, staged gate, native-token Edge boundary and conservative rollback: scoped PASS; no live test run by reviewer. Constructor omission now refuses writes (`writesEnabled !== true`). Reviewer required shutting down provider client issuance/refresh before detaching hook; SQL header and rollback step1 now state this explicitly. Late FK cleanup fix has separate local regression evidence; do not attribute unreported tests to reviewer.

Additional FK-only independent source reread:PASS. Receipts retain historical identity; access/admissions cascade on user deletion; native-session provenance cannot block cleanup; client deletion removes static policy and retained history cannot authorize without live client/session/profile/consent checks. No tests or live mutations performed by reviewer. Root final local suite73/73.
