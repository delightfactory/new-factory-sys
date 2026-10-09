# Superseded by final local verification

[MCP-FINAL-STATUS.md](MCP-FINAL-STATUS.md) contains the later clean62-case run and current access/approval findings. Below is the historical checkpoint4.

# MCP checkpoint 4 — 2026-10-09

Requested intermediate handoff. No production deployment or live access provisioned.

Workspace: C:/Users/DELL/Documents/Codex/2026-10-09/task/factory-mcp
Branch: feat/remote-mcp-foundation
Factory main/base: 8b2422eeb0bcd59f5ada330835da2979213b1f6e
Opal main/reference: 5b96daf7b73103614fc6fadc694156d4713571c8
Original checkouts untouched; no commit/push/deploy/live migrations/client/grants/credentials.

## Since previous handoff

- Added factory_schema and factory_analyze: 31 curated business tables and 52 fixed relationships, typed structured queries, joins, count/sum/avg/min/max, numeric products, bound filters, deterministic ordering, up to 250 returned rows with lookahead/truncation. Aggregate calculation precedes paging. No SQL strings, CTE/function/multistatement grammar, arbitrary tables, views or predicates.
- Analytical SELECT runs as authenticated (non-superuser/non-BYPASS/nonowner) inside REPEATABLE READ READ ONLY. Existing source SELECT privileges and RLS apply; no business-table grants added. Real OAuth/session/client/admission/resource checks remain required. Source RLS enablement is disclosed per selected table, not claimed universally enabled. No hosted policy verification claim.
- Analytical paging across separate calls uses a new database snapshot; join multiplicity may duplicate header amounts. These limitations are returned explicitly.
- Full combined journey now runs native consent admission → provider consent → token hook → signed SDK → analytical read and business writes/results → live role/consent denial, against actual local SQL.
- Native actual application browser proof without MCP environment/policy: native login; treasury create100; expense150 refused with Arabic error and retained form; corrected expense20 yields80; invoice customer/product qty2*20 saved as draft40. Synthetic local auth/data; fixed HTTP adapter executes actual SQL, not hosted PostgREST. Screenshot: native-invoice-local.jpg. Native production browser journey not completed (tab became unavailable).
- Closed record/header snapshot consistency, bundle parent and movement filters, coherent all-table backup snapshot, unsupported report filters, native displayed order codes, atomic manual financial deletion and protected linked reversal.
- Final source review found no concrete analytics SQL injection/RLS bypass; all policy/live-isolation claims remain scoped. Added four atomic MCP edit tools matching native edit, and exact protected deletion routes. Their two new affected tests pass.
- Runtime catalog now69tools (54commands,12extendedreads,3foundationreads). Tool count is not evidence of full source parity. See source capability matrix, including pending items.

## Evidence — do not sum different runs

| Artifact | Result | Scope |
|---|---|---|
| mcp-final-gates.txt | latest full run62 tests:60pass/2fail, before fixes | Both failures were the two new atomic-edit/handoff regressions; corrected afterward |
| mcp-checkpoint4-targeted.txt |2pass/0fail/1.864s | Latest exact two affected regressions, actual SQL rollback/retry and nonexecuting linked finance handoff |
| mcp-analytics-targeted.txt |22pass/0fail/2.326s | Structured calculations, unsafe inputs, role metadata, native restrictive RLS and executor isolation |
| preceding full integrated run |60pass/0fail/13.817s | Clean combined OAuth/SDK/analytics/full business suite before final edits; log overwritten by latest full run, hence prior recorded result only |
| mcp-final-postgres.txt |PASS | Actual PostgreSQL17.10 all4migrations, synthetic OAuth, readonly analytics; concurrent duplicate create/completion and component cost update; before last two edits |
| mcp-final-vercel.txt |PASS | Actual Vercel Node24 emitted handlers, discovery, signed SDK and catalog; before final4edittools |
| mcp-checkpoint3-types.txt |0changed-file diagnostics;1existing | Native ten-service integration/consent; no full frontend build |

No final clean62-case single run is claimed. HR task remains priority; successful checks were not repeated after checkpoint request.

## Remaining for resume

1. One final affected all-tests run if final acceptance requested; package catalog count4 additions and PostgreSQL edit/handoff affected gates if needed. Do not rerun older successful checks indiscriminately.
2. Resolve remaining source-matrix P items and finish representative native production/consent browser journey. All ten services have source/type integration, not ten independent browser proofs.
3. Hosted factory Auth catalog/refresh contract and staged HTTP rejection on REST/RPC/Storage/Realtime remain unproved. The connected Supabase account lists only two other projects, not factory cgqunqczuvwfvuzlsvyy; read-only access requires the matching factory account/dashboard.
4. No verified staging database exists. Existing proposal is Vercel preview against live factory; this entails live SQL/Auth changes and MUST NOT execute without exact approval. No live setup approval requested in this intermediate checkpoint. At final review request one concrete scope: target environment, exact HTTPS callback/resource, one public PKCE client, closed dynamic registration, expiring user/client policy, restricted gateway login/secret channel, hooks and expiry/revocation. Credentials handled by user/approved channel, no production app deployment.

Resume this branch and saved artifacts. Do not recreate checkout or overwrite unpublished work.
