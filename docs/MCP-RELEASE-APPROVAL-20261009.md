# Exact release authorization and reviewed source

Owner approval `Sentinel_5afce76d7fe48191814897f398e4bc76` at
`2026-10-09T20:02:38.864847+00:00` says "نعم اوافق" following the exact
production request `Sentinel_b8020558aed48191af744e4719cd8116`. The supplied
original transcript explicitly covers migration
`20261009140827_comprehensive_mcp_operations.sql`, then OAuth, read-only
analytics and compatibility migrations, including business-function,
permission, schema and write-path changes, followed by the compatible frontend
deployment according to the rollback plan. This supersedes the earlier lack
of recognized authorization for that exact live mutation.

The parent authorized one fresh attempt through the same migration tool using
this evidence. On another rejection stop; no alternate SQL path, retry or
dependent deployment. Do not reapply SQL1. Do not manually dispatch Actions.

Reviewed compatibility source passed 96/96 sequential local tests, the
production build and actual local browser/service/SQL verification. Manifest
integrity passed for all 19 compatibility files before this documentation-only
release record. Original four migration sources remain unchanged. Main and
remote review branch were refreshed and are respectively
`8b2422eeb0bcd59f5ada330835da2979213b1f6e` and
`9c6fc6d41193039683f73db0cb8b58acc312fa14` before this release commit.

Preflight migration history still contains only version `20261009172717`,
name `remote_mcp_foundation_20261009130620`. Fresh 12-native-function
definitions/owners/ACLs were read without business rows or Auth secrets.

Target Supabase project: `cgqunqczuvwfvuzlsvyy`.
Target Vercel project: `prj_RKDdNPEAQAMp1c2BQ3L3EZc8nhxj`, team
`team_AYQTvxuQJ1EepKxDVhzjX1ew`, resource
`https://new-factory-sys.vercel.app/api/mcp`.

MCP writes remain closed until real hosted identity and isolation gates pass.
Owner enters any gateway/signing credentials through secure provider UI and
performs OAuth consent personally. This approval does not authorize the agent
to enter secrets or create consent grants for the owner.

The recorded pre-release verification is local, with synthetic Auth in the UI
harness. Read this record together with `MCP-COMPATIBILITY-LINKING.md` and
`MCP-NATIVE-PRODUCTION-CLOSURE.md`; live outcomes are recorded separately.
