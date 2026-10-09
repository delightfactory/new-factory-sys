# Final local verification — 2026-10-09

Current compatibility closure: **96/96 tests passed**, concurrency 1, 22.630s,
including historical/native/cached RPC behavior, six roles, financial payment
bounds and restoration of all 12 native RPC definitions/owners/grants. Evidence:
workspace `native-final-tests.txt`. Actual production finance dialog + services
against local SQL passed at 390/768/1280px: both transfer legs restore, failure
preserves selection and all balances. Browser Auth is synthetic; evidence:
workspace `native-compatibility-ui/evidence.json` and screenshots.
The real production service/toast also passed: deficient raw quantity -1 and
order cost 2 are persisted and the warning shows the actual item and quantity.
Production original-vs-native cost/WACO, replay/cached completion, strict MCP
and both historical purchase-return policies are covered by the current suite.
Details and one-pass analogous audit: `MCP-NATIVE-PRODUCTION-CLOSURE.md`.

Final production build passed: TypeScript + Vite 7.2.6 + PWA generation (24
precache entries). Evidence: workspace `native-final-build.txt`. Existing large
bundle and stale Browserslist warnings remain; no dependency update was added.
The actual browser harness also asserts the SDK sends one exact compatibility
header, and refreshed native financial table writes remain available.

Current live state and approval blocker: `MCP-ACTIVATION-RUN.md`. Only SQL1 is
applied; no new live SQL, Auth, merge or deploy occurred in this compatibility
follow-up. Local changes remain uncommitted on `feat/remote-mcp-foundation`.
Ready linking/recovery sequence and hosted gates: `MCP-COMPATIBILITY-LINKING.md`.
The prior runs and pre-activation observations below are historical.

Current final suite:73 tests,73 pass,0 fail,36.808s, concurrency1. Focused native Auth/profile/rollback:9/9; actual Edge handler with local Auth substitute:PASS. Final PostgreSQL17.10 migration/concurrency/cost check:PASS. See mcp-permanent-* logs; these supersede the earlier62-count evidence. No hosted Auth issuance/session refresh or deployment performed.

Superseding activation addendum: permanent revocable one-setup plan in MCP-ACTIVATION-APPROVAL.md and MCP-ROLLBACK-AND-COMPATIBILITY.md. The earlier 60-minute proposal is archived, not a user requirement. Nothing live is authorized by these drafts or executed. New bounded native profile/session/Edge checks and rollback replay are in mcp-permanent-activation-tests.txt; old 62-test results below are historical. Live read-only metadata found create-user verify_jwt=true and public JWKS keys=[]; local Edge native-token/active-admin fix and staged default-closed write gate address the reviewed compatibility requirements. Provider config/signing and real OAuth/session/HTTP isolation gates remain pending before live enablement. No secret/credential/grant or production deployment.

Workspace:C:/Users/DELL/Documents/Codex/2026-10-09/task/factory-mcp
Branch:feat/remote-mcp-foundation
Factorybase/main:8b2422eeb0bcd59f5ada330835da2979213b1f6e
Opalreference:5b96daf7b73103614fc6fadc694156d4713571c8
No commit/push/live deployment/migrations/credentials/grants.

Latest single full run:62tests,62pass,0fail,13.678s, test-concurrency=1. Includes structured analytics calculations/RLS/unsafe-input refusal, combined nativeconsent→OAuthhook→signedSDK→realSQLcommands/results/analytics→role/consentrevocation, atomicedit retry/rollback and protectedfinance nonexecution. See mcp-final-clean.txt.

Actual PostgreSQL17.10: all4migrations+syntheticOAuth+readonlyauthenticatedanalytics; two-session identical-request creation once, different completion requests affect stock once, locked componentcost race uses committedcost. PASS. See mcp-final-clean-postgres.txt.

Actual emittedVercelNode24 handlers: publicdiscovery/no secrets; POST guards; unconfiguredMCPfailsclosed; signedSDKinitialize/69toollist/call/operationnumber/401challenge. PASS. See mcp-final-clean-vercel.txt. This is a local artifact build/test, not a deployment.

Ten native services/consent typecheck:0changed-file diagnostics,1pre-existing unrelated diagnostic. Representative actual UI with syntheticlocalAuth and actualSQL, noMCPconfig: native login; treasury100; insufficient150denied/Arabicformretained; expense20→80; draftinvoice2*20→40. See native-invoice-local.jpg. Nativeproduction/consent browser flows and everyservice browser journey are not independently verified.

Independent review: scoped security/sharedservicesPASS, no concreteSQLinjection/RLSbypass/newatomic-edit defect found. Corrected documented counts:69tools=54commands+12extendedreads+3foundationreads; fivefixedRPCroutes. Matrix must retain unsupported unpaid field-to-field predicates and incomplete per-workflow parity. No complete analytical/nativeUIparity claim.

Analytical limits:31curatedbusinessbase tables,52fixedrelationships, typedcolumn/product/5aggregateexpressions, boundscalarfilters, limit250/truncation and fullinputaggregationbeforepaging. No rawSQL/CTE/function/multistatementchannel, unsafeviews/auth/system/credentials. SELECTowner authenticatednonBYPASSnonowner, READONLYREPEATABLEREAD, existing sourcepermissions/RLS and realrole domains. Some live sourceRLS is disabled; flags disclose it. Separatepage calls use new snapshots; one-to-manyjoins can repeatheaderamounts. No refresh/liveHTTPisolation proof.

Liveaccess reconciled: owner reconnected correct organization; list_projects now displays factory, directget_project/readonlySQL/list_branches succeed. No reconnection request remains. Nativeadmin identityunchanged, clientcount0, nofactoryMCP roles yet. No activeSupabasedashboardtab. Previous secretfile rejectionnot retried. See MCP-ACCESS-RECONCILIATION.md.

Pending: owner provider/signing/ChatGPTcallback/credential/consent inputs, one exact activationapproval, stagedread-only REST/RPC/Storage/Realtime and realprovider flow. Existingdb islive, not staged. See MCP-ACTIVATION-APPROVAL.md. Production frontenddeployment remains outside approval. Development approval is already granted and is not requested again.

Read-only live schema comparison:31analytical tables/281typedcolumns,0missing/0mismatch; native atomicproduction/packaging WACO bodies match source baselines and RPCsignature expectations. Does not prove hostedOAuthissuance or HTTPisolation.
