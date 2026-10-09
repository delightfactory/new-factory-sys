# Local compatibility closure — 2026-10-09

Review workspace: `feat/remote-mcp-foundation`. Main baseline:
`8b2422eeb0bcd59f5ada330835da2979213b1f6e`; only SQL1 is applied live.
Latest pushed review commit: `9c6fc6d41193039683f73db0cb8b58acc312fa14`,
https://github.com/delightfactory/new-factory-sys/pull/1 . Compatibility changes
remain local; no merge, deployment, credentials or OAuth grant occurred here.

## Linking order

1. Resolve the recorded automatic-approval rejection for exact SQL2 and obtain
   recognized approval for remaining live migrations. Do not use an alternate
   execution path. Keep MCP writes disabled.
2. Review the completed build first. Take fresh migration and native function,
   owner and ACL snapshots; confirm baseline and exact source hashes. Apply
   SQL2, SQL3 and SQL4 in order, then SQL5
   `20261009190000_native_mcp_compatibility.sql` in a single transaction with
   bounded lock/statement timeouts. Never reapply SQL1.
3. Coordinate SQL5 and the ready frontend in a short announced maintenance
   window. SQL5 intentionally stops old financial table writes before their
   first effect. Until the new frontend is published, refresh alone cannot
   restore that capability. Refresh cached tabs/PWA after switching. Other
   cached document/order RPCs retain exact signatures and route through shared
   atomic operations. This rollout includes a brief financial-write interruption.
4. Verify both new public native RPCs exist and are executable by authenticated
   only (not anon/gateway), saved native originals number 12, and the financial
   statement trigger exists. Verify profile-role edits remain admin-only.
   Hosted native sign-in, refresh, reset, create-user and each operating role
   must pass before opening commands.
5. Owner alone enters gateway credentials/signing settings and creates the
   exact static OAuth client/policy through approved secure UI. Owner consents
   to the exact ChatGPT connection. Verify real resource audience, client,
   session, expiry/revocation, inactive/viewer denial and user isolation on hosted
   Auth. Validate reads first, then an approved invoice/order with returned
   number; replay its request and verify one business effect. Enable writes only
   after these gates pass. No generic SQL or user-facing service role.

## Preserved behavior

Native manufactured-cost edits persist the submitted value atomically.
Native production and explicit packaging despite shortage retain original cost
equations and capture actual effects. The production confirmation explains that
raw stock may become negative; the actual negative items/quantities appear in a
warning after completion. Native purchase-return posting follows the saved
original function's stock policy, including its own sufficiency guard if present;
the historical migration implementations differ. MCP retains strict stock checks
for all three paths. New and cached native
posting/completion share effects and cannot double-apply or resurrect void
documents. Historical cancellations use original native rules and recorded
cost. Old orders without snapshots retain original current-recipe semantics;
the UI reports that limitation rather than inventing historical valuation.

Financial deletion reverses cash, party and invoice paid amount atomically and
keeps payment within invoice total. Original evidence remains in audit/receipt.
Transfers require explicit selection of a validated reciprocal leg; date and
amount alone never identify a pair. Failure preserves the selection and leaves
balances unchanged. Later historical payments reverse in their actual treasuries
before historical invoice cancellation.

The `x-client-info` marker distinguishes current UI from cached code. It can be
forged and is not an authorization boundary. Actual native identity/session/role
checks enforce permission. OAuth callers cannot use native exceptions.

## Recovery and verification limits

For native SQL5 recovery, use `MCP-COMPATIBILITY-ROLLBACK.sql`: restore all 12
saved native definitions, owners and grants, remove the finance trigger, disable
new native RPCs and coordinate frontend rollback. Preserve receipts, private
legacy functions and business rows. Full MCP recovery then uses
`MCP-NATIVE-ROLLBACK.sql`. Stop provider issuance/refresh and revoke this client's
consent/grants/sessions before removing its Auth hook.

Local SQL and actual browser tests prove business behavior and local integration.
Synthetic browser Auth does not prove hosted OAuth, PostgREST user isolation,
password reset or Edge/native session behavior. Those remain linking gates.
