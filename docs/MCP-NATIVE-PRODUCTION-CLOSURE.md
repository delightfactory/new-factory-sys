# Native production compatibility closure

Local follow-up on `feat/remote-mcp-foundation`, based on pushed review HEAD
`9c6fc6d41193039683f73db0cb8b58acc312fa14`. No live mutation, deployment,
credential, consent grant, merge or push was performed in this follow-up.
The earlier independent review's production stock-policy finding is addressed
by this source; its older 92-test evidence does not cover this source.

## Behavior and evidence

Native completion executes the preserved original production/packaging function
under the authenticated user's actual role checks, the shared transaction and
stock locks. It stores actual before/after stock and cost effects. Production
keeps its original deficient-raw behavior. Packaging's explicit proceed action
keeps its original deficient-component behavior. Completion status and receipts
prevent repeated execution through new commands, new keys and cached RPCs.

The production confirmation explains possible negative stock. The real service
shows a warning containing actual affected names, negative quantities and units.
The browser evidence uses the real service, SDK, toast and local SQL, with
synthetic Auth and loopback traffic only. It does not prove hosted Auth.

The production fixture compares the preserved original and native path: raw
quantity 0 becomes -1, raw cost remains 2, semi quantity 10 becomes 11,
semi WACO is 42/11, order cost is 2. Same-key replay, a new key and cached
completion retain one effect and two movements. Cancellation restores raw 0,
semi quantity 10 and cost 4. Packaging yields semi -10, finished 20, order cost
90 and finished WACO 7, then cancellation restores finished cost 5.

Actual locally issued OAuth claims still reject deficient production, packaging
and purchase-return posting. Failure rolls back status, stock and effects.

## One-pass analogous audit

- Sales posting and bundle assembly already require adequate stock in their
  original engines. The compatibility adapter retains that policy.
- Standalone returns remain supported: the shared linked-invoice validation
  returns immediately when the original invoice is absent.
- Historical purchase-return engines differ: the latest repository baseline
  permits negative stock; an older implementation checks sufficiency. Native
  posting delegates the decision to the preserved original, retaining all other
  shared validation, financial changes and cost snapshots. MCP remains strict.
  Both permissive and strict historical baselines are tested locally; only the
  old cost-column name is adapted to the current fixture in the strict test.
- The saved preflight snapshot does not include purchase-return posting.
  Capture all 12 definitions, owners and ACLs before live SQL5. Do not infer
  live behavior from migration filenames.

The private native commercial adapter is generated from the shared engine only
after its original-function references are rewritten. A fixed source guard
aborts migration if the expected condition is absent. Future shared-engine
changes must review this adapter too. Public/gateway execution is revoked.

An independent read-only review found no remaining blocker for this local
compatibility fix. It separately noted that old directly-created cached return
drafts may lack universal positive/nonempty-item validation. This is not a
newly demonstrated regression or a claim that all malformed old drafts are
safe; it remains outside this capability-preservation follow-up.

## Release boundary

Use `MCP-COMPATIBILITY-LINKING.md` for SQL2 -> SQL3 -> SQL4 -> SQL5,
coordinated frontend rollout, financial-write interruption and recovery.
Only SQL1 is currently live. The prior automatic approval rejection must be
resolved through its approved path; no migration retry or workaround is part
of this delivery. Hosted sign-in/refresh/reset, roles, real OAuth/resource
isolation and default-closed write-gate checks remain required before activation.

Final latest-source logs: workspace `native-final-tests.txt`,
`native-final-build.txt`, `native-compatibility-ui/evidence.json`, and
`native-review-integrity.json`. The manifest hashes the delivered source and
the archive contains the exact test/build evidence.
