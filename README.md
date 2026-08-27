# Mobile Mechanic AI

Mobile-first, multi-shop automotive repair application for `mobile-mechanic.app`.

The approved product direction is preserved:

- dark black/charcoal, red-glow mechanic workspace;
- clean white/red customer intake;
- AI as an advisory assistant, never the final repair authority;
- immutable `shop_id` tenant boundaries;
- Netlify hosting, Supabase auth/data/storage, Stripe platform billing, and server-side external integrations.

## What this build contains

- Responsive mechanic protection, sign-up, sign-in, dashboard, jobs, customers, AI workup, findings, estimates, technician invite, and platform-admin interface foundations.
- Shop-specific intake at `/intake/:shop-slug`, including vehicle selection, VIN entry/decoding, current location, voice complaint capture, returning-customer-safe backend matching, and pre-purchase inspection fields.
- Netlify Functions for Supabase sessions, shop signup/login, dashboard data, public shop lookup, customer intake, technician invitations, NHTSA VIN decoding, and OpenAI diagnostic workups.
- Supabase schema with permanent `shp_...` IDs, 60-day trials, role definitions, row-level security, composite tenant foreign keys, estimate/invoice/service-history foundations, and admin audit records.
- An offline-first static shell and local note-friendly service worker foundation.
- Smoke checks for source syntax, safe disconnected states, tenant-schema markers, logout cookies, public-intake bot friction, and invalid VIN handling.

See [Build status](docs/BUILD_STATUS.md) for the exact implemented/not-connected boundary.

## Safe local testing

Requirements: Node.js 20 or newer.

```bash
npm test
```

For a static interface-only preview, serve the `public` directory. Netlify Functions require a Netlify local development environment or a deployed Netlify site.

The explicit **Local UI Demo** contains labeled sample records. It does not claim that AI, messaging, payments, inventory, CARFAX, or any outside action occurred.

## Supabase setup

1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor before production data is added.
3. Enable the desired email/password confirmation behavior and set the approved authentication redirect URLs.
4. Add these values to the existing Netlify site's environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_ORIGIN=https://mobile-mechanic.app
```

The Netlify Functions also accept `SUPABASE_URL` and `SUPABASE_ANON_KEY` if you prefer those names. If the `VITE_` variables already exist in Netlify, keep them.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never be added to browser code or GitHub.

After the Platform Owner creates a normal authenticated account, promote that account once using its Supabase Auth UUID:

```sql
insert into public.platform_admins (user_id, role)
values ('AUTH-USER-UUID', 'platform_owner');
```

Do not hard-code the owner's email or password.

## OpenAI setup

The diagnostic function uses the server-side Responses API and defaults to `gpt-5.6-luna`. Configure in Netlify:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-luna
```

The key belongs only in secure environment variables. The browser never receives it. AI output is saved to the applicable tenant/job only after a valid authenticated request and is always marked advisory.

## Existing Netlify site and GitHub

Preserve the existing Netlify project, domain, HTTPS, and DNS for `mobile-mechanic.app`.

The intended production source is:

```text
Autotechniquesapp/Mobile-mechanic.app
branch: main
publish directory: public
functions directory: netlify/functions
```

Before linking the existing Netlify site:

1. Confirm GitHub is signed in as `Autotechniquesapp`.
2. Confirm the exact repository contains this build and is not empty or an old prototype.
3. Link that exact repository to the **existing** Netlify site.
4. Set `main` as the production branch.
5. Configure environment variables in Netlify, not in GitHub.
6. Deploy a preview and run the release checklist before promoting production.

For temporary static Netlify Drop testing, upload the `public` directory. That preview will not include secure Functions. A full connected deployment should build from the project root using `netlify.toml`.

## Production release gate

Before production use:

- apply and validate the Supabase schema in a staging project;
- test Shop Owner, Manager, Technician, Service Writer, and platform-admin permissions;
- verify two unrelated test shops cannot read or relate each other's records;
- configure the OpenAI key in Netlify and run a controlled diagnostic workup;
- confirm intake creates records only in the slug's shop;
- test mobile camera, microphone, geolocation, poor-signal behavior, and accessibility on real devices;
- add attorney-reviewed Terms, Privacy, Data Use, Subscription, AI limitation, and IP documents;
- connect Stripe and verify webhooks in test mode before enabling subscription gating;
- keep every unconnected service visibly labeled **Not Connected**.

No production secret is included in this project package.
