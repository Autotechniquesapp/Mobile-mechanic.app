# Stale branch and production-source audit — 2026-09-23

This audit compares the repository's old branches with current `main` and with the live Supabase project. The rule is: do not merge stale branches wholesale. Carry forward only still-correct changes onto a fresh branch, preserve newer production behavior, and delete obsolete branches only after the reconciliation PR is merged.

## Branch decisions

| Branch | Decision | Reason / action |
| --- | --- | --- |
| `Autotechniquesapp-patch-1` | Obsolete | Contains an old sample Jekyll Pages workflow. Current `.github/workflows/pages.yml` is the production Pages deployment. Do not merge. |
| `Autotechniquesapp-patch-2` | Obsolete | Contains a generic placeholder `SECURITY.md` with fake version examples. Do not merge; write a real policy separately if needed. |
| `chore/expand-integration-health` | Superseded | No unique commits remain versus current `main`. |
| `codex/integration-safety-20260828` | Recover selectively | PR #3 is far behind `main` and explicitly says not to merge as-is. The live QuickBooks/Xero/PayPal OAuth code derived from this work was recovered from the deployed Supabase functions instead of copying the stale branch. The frontend actionable-error handling was reapplied to the current integration UI. |
| `codex-real-app-foundation` | Obsolete | Old Netlify architecture. Current production is GitHub Pages + Supabase. Do not merge. |
| `codex-real-app-foundation-v2` | Obsolete | Duplicate old Netlify architecture. Do not merge. |
| `feat/first-100-launch-trial` | Recover selectively | Production DB/backend already enforce the first-100 launch offer, but current Git frontend/docs had drifted. The launch billing UI, ASAP intake option, and platform-owner decoupling were recovered. The branch itself must not be merged because it also contains stale code and an escaping defect. |
| `fix/addons-coming-soon` | Superseded | No unique commits remain versus current `main`. |
| `fix/button-routing` | Superseded | Current `main` already contains delegated routing and routing regression coverage. Do not merge the old PR/branch. |
| `fix/release-readiness-blockers` | Superseded by newer work | Selected-shop job reads, AI fallback disclosure, estimate backend, Square authorization, and regression coverage exist on current `main` in newer form. Do not merge the stale branch. |
| `fix/scope-production-job-writes` | Recover selectively | The selected-shop write filters were missing on current `main`. They were reapplied to schedule/findings/complete/decline writes while preserving the newer Square final-balance-on-completion logic. |
| `fix/simplify-job-payment-screen` | Superseded | PR #50 was merged; no unique commits remain. |
| `fix/square-mobile-layout` | Do not merge extra commits | PR #35 was merged, but later branch-only Microsoft 365/OneDrive commits use an older integration approach. Current production intentionally hides those providers and a newer MCP-connections path now exists. Re-evaluate Microsoft/OneDrive through the current integration architecture instead of resurrecting the old bridge. |
| `fix/training-certification-actions` | Superseded | No unique commits remain versus current `main`. |
| `fix-intake-flow-sep6` | Superseded | No unique commits remain versus current `main`. |

## Changes recovered on the reconciliation branch

- Scope job schedule, technician findings, complete-job, and decline-job writes to the selected `shop_id`.
- Keep Square final-balance-on-completion behavior while adding that tenant scope.
- Restore first-100 launch-offer behavior in the billing UI and align README copy with the production rule.
- Restore the public intake “As soon as possible” scheduling choice.
- Remove obsolete frontend guards that still claimed Stripe billing was not connected.
- Decouple Platform Owner UI from the AutoTechniques shop identity; protect permanent complimentary shops by `comped_permanent`, not slug.
- Preserve detailed backend integration errors in the shop integration UI.
- Force MCP, QuickBooks, Xero, PayPal, Google, and business-integration requests to authorize against the shop currently selected in the app instead of the user's first membership.
- Recover exact deployed source for QuickBooks OAuth, Xero OAuth, PayPal onboarding, Google OAuth, Stripe subscription billing, Platform Admin, and the shared OAuth safety helper.

## Production / GitHub source drift

The live Supabase project contains more Edge Functions and migration history than GitHub currently tracks. This is not a reason to copy old branches blindly.

At audit time, deployed functions not represented by a same-named source directory on `main` included:

- `ai-credit-billing`
- `ai-quote`
- `calendar-sync`
- `dropbox-oauth`
- `google-business-oauth`
- `integration-actions`
- `mcp-connections`
- `message-delivery`
- `paypal-onboarding`
- `plate-lookup`
- `platform-admin`
- `platform-costs`
- `quickbooks-oauth`
- `shop-payment`
- `sms-send`
- `square-oauth`
- `stripe-billing`
- `stripe-connect`
- `stripe-shop-invoice`
- `stripe-webhook`
- `technician-help`
- `vehicle-data`
- `xero-oauth`

This reconciliation PR recovers the critical branch-related OAuth/billing/admin source listed above, including Google OAuth after the multi-shop audit exposed the same first-membership problem. The remaining deployed-only functions should be synchronized from production in a dedicated source-of-truth pass, using the deployed versions as the reference.

The production migration history also includes migrations that are absent from the repository, including the first-100 launch promotion and the newer MCP shop-connections migration. Do not invent replacement historical migration files from memory. Reconcile the remote schema/migration history with a linked Supabase CLI workflow (`supabase db pull` / migration-history review) and commit the resulting canonical migration state.

## Branch cleanup after merge

After this reconciliation PR is merged and CI is green:

1. Close stale PR #3 as superseded by the recovered deployed source.
2. Delete fully superseded or obsolete branches.
3. Keep no long-lived feature branch merely because it contains the only copy of production code.
4. Run a dedicated Supabase source/migration reconciliation for the remaining deployed-only functions.
