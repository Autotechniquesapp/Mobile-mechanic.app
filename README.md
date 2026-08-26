# Mobile Mechanic AI — GitHub / Netlify Ready Prototype

This is the current Netlify-ready prototype built around the approved black/red mechanic UI and white/red shop-linked customer intake.

## Upload to GitHub

Use the GitHub account **Autotechniquesapp**. Upload the **contents of this folder** to the correct Mobile Mechanic AI repository, with `index.html` at the repository root. Use `main` as the production branch.

Then connect the existing Netlify project that serves **mobile-mechanic.app** to that repository. Netlify reads `netlify.toml` and publishes the project root.

## Demo logins

- Platform Owner: `master@mobile-mechanic.app` / `MasterDemo2026!`
- Billing Admin: `billing-admin@mobile-mechanic.app` / `BillingDemo2026!`
- Support Admin: `support-admin@mobile-mechanic.app` / `SupportDemo2026!`
- Demo Shop Owner: `demo@mobile-mechanic.app` / `DemoShop2026!`
- Demo Technician: `tech@mobile-mechanic.app` / `TechDemo2026!`

These credentials are **prototype-only browser demo credentials**. Replace them with secure backend authentication before commercial use.

## Included prototype flows

- Platform Owner and delegated platform admin roles (Billing, Support, Operations, Technical, Read-Only)
- Admin activity log and role-limited shop actions
- Multi-shop browser prototype with immutable `shop_id` model
- 60-day trial and Solo $29.99 / Shop $69.99 / Pro-Fleet $129.99 plan UI
- Shop owner + technician/service-writer/manager accounts and seat limits
- Shop-specific branded intake URL and app identity
- Customer intake, current location, VIN decode using free NHTSA vPIC where available, voice Customer States
- AI pre-workup UI, diagnostic checklist, AI Second Opinion, Before You Replace It
- Technician findings, photos, diagnostic history surfaces
- Good / Better / Best estimates, secure-link style customer selection/approval, single-estimate option
- Vehicle/job-specific YouTube repair search links
- Quick quote, markup, labor, tax, travel, deposit settings
- Pre-purchase inspection, warranty/comeback, parts/warranty/core, fleet/roadside, training/templates
- CARFAX-ready service record preparation without falsely claiming submission
- Shop data export

## Production services still required

For real shops/customers, connect secure production services:

1. Supabase Auth/Postgres/Storage (or equivalent) with tenant/RLS protection by `shop_id`.
2. Stripe subscriptions and webhooks through server-side functions.
3. AI provider through Netlify Functions.
4. Authorized CARFAX connection before any record can be marked Submitted.
5. Optional paid VIN/plate, parts inventory, SMS/email, maps/service-data APIs only when justified.

## Security

Never commit Stripe secrets, AI keys, CARFAX credentials, Supabase service-role keys, or other private credentials to GitHub. Store them in Netlify Environment Variables and access them only from server-side functions.
