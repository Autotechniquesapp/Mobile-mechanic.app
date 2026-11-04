# Issue #55 Supabase migration recovery

Last updated: 2026-10-04

## Scope

This document covers only Supabase database migration history for issue #55.

Out of scope:

- Edge Function source reconciliation. PR #54 and PR #56 already recovered the deployed Edge Function source into GitHub.
- Supabase security/performance advisor warnings. Those warnings need a separate hardening pass because live flows may rely on current grants.

## Evidence boundary

- Issue #55 reports 56 applied production Supabase migration entries.
- The repository currently contains 12 SQL files under `supabase/migrations/`.
- Issue #55 reports that 10 production migration names semantically match repository migrations, with some timestamp differences.
- The issue body does not provide the full 56-row production migration list.
- Do not invent old migration SQL from current schema, memory, branch names, or guesses.

## Recoverable GitHub migrations

These migrations have exact SQL in GitHub and can be recovered from repository history.

| Repository migration | Earliest Git evidence | Recovery status | Production-history status |
| --- | --- | --- | --- |
| `202609010001_security_hardening.sql` | `f892d93` - 2026-08-31 - Harden intake and technician data access | Exact SQL recoverable | Needs live migration-list mapping |
| `202609040001_intake_queue_shop_access.sql` | `ae55d55` - 2026-09-04 - Allow shops to view their intake queue | Exact SQL recoverable | Needs live migration-list mapping |
| `202609060001_restore_intake_ai_trigger.sql` | `2f09f5e` - 2026-09-06 - Restore automatic intake AI workup trigger | Exact SQL recoverable | Needs live migration-list mapping |
| `20260906180128_add_privacy_data_use_acceptance.sql` | `a43ff0f` - 2026-09-06 - Track privacy and data-use acceptance migration | Exact SQL recoverable | Needs live migration-list mapping |
| `20260906180910_harden_public_rpc_and_internal_tables.sql` | `ddad626` - 2026-09-06 - Track RPC and internal table hardening migration | Exact SQL recoverable | Needs live migration-list mapping |
| `20260906181035_move_privileged_rpcs_private.sql` | `ddad626` - 2026-09-06 - Track RPC and internal table hardening migration | Exact SQL recoverable | Needs live migration-list mapping |
| `20260906181206_optimize_shop_integrations_rls.sql` | `800a74b` - 2026-09-06 - Optimize shop integration RLS auth lookup | Exact SQL recoverable | Needs live migration-list mapping |
| `202609100001_shop_module_preferences.sql` | `f8f08aa` - 2026-09-10 - Make Optional Modules controls work and persist | Exact SQL recoverable | Needs live migration-list mapping |
| `202609100002_square_full_sync.sql` | `aabd55f` - 2026-09-10 - Add full Square customer and payment sync (#25) | Exact SQL recoverable | Needs live migration-list mapping |
| `202609120001_single_platform_owner.sql` | `6826915` - 2026-09-12 - Fix mobile layout and enforce single platform owner | Exact SQL recoverable | Needs live migration-list mapping |
| `20260912102500_scope_jobs_to_selected_shop.sql` | `50da930` - 2026-09-12 - Fix selected-shop job isolation | Exact SQL recoverable | Needs live migration-list mapping |
| `202609230001_mcp_shop_connections.sql` | `5c6d64f` - 2026-09-23 - Add shop-scoped MCP connected apps | Exact SQL recoverable | Needs live migration-list mapping |

## Unrecoverable without production evidence

The remaining historical production entries are not recoverable from the repository alone.

Treat them as one of these:

1. Exact historical SQL, only when recovered from an authoritative source such as a committed file, reviewed PR diff, Supabase artifact, database backup, or verified deployment bundle.
2. Current-schema baseline coverage, clearly labeled as a baseline and not historical SQL.

## Required live recovery steps

Run these from an authenticated machine linked to the production Supabase project:

```bash
supabase migration list --linked > docs/issue-55-production-migration-list.txt
supabase db pull --linked
```

Then:

1. Fill `docs/issue-55-production-migration-list.txt` with the real production migration list.
2. Map every exact or semantic production match to the repository file above.
3. Put every production row without authoritative SQL into baseline coverage.
4. Save the pulled current-schema snapshot as a new migration named like `YYYYMMDDHHMMSS_current_schema_baseline.sql`.
5. Keep the header from `supabase/migrations/README.md` on that baseline migration.
6. Validate by applying the migration set to a clean database and comparing schema shape to production.

## Current count map

| Bucket | Count | Treatment |
| --- | ---: | --- |
| Production migration entries reported by issue #55 | 56 | Source of truth for production history count |
| Repository SQL files currently present | 12 | Recover exact SQL from GitHub |
| Production names issue #55 says semantically match repository migrations | 10 | Map after live migration-list export |
| Repository SQL files without confirmed production semantic match from issue #55 count | 2 | Keep as GitHub SQL, but do not call production-applied until the live list proves it |
| Production entries not represented by GitHub SQL | 46 by issue #55 semantic-match count | Recover only from authoritative source; otherwise cover with current-schema baseline |
