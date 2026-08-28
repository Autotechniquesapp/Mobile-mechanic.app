# Mobile Mechanic AI

Mobile Mechanic AI is a multi-shop automotive workflow platform for mobile mechanics, repair shops, and fleet service operations. The production path uses GitHub → Netlify for the frontend and Supabase for authentication, tenant-isolated data, customer intake, and secure estimate approvals.

## Production deployment

- Repository: `Autotechniquesapp/Mobile-mechanic.app`
- Production branch: `main`
- Netlify publishes the repository root using `netlify.toml`
- Supabase provides Auth/Postgres/RLS and customer-facing Edge Functions

## Subscription pricing

New shops receive a 60-day trial of the plan they select.

- **Solo — $29.99/month:** 1 included user. Customer intake, customers/vehicles/jobs, basic AI workup, Good/Better/Best estimates, secure customer approval, voice notes, quick quote, calendar, basic reporting, and data export.
- **Shop — $69.99/month:** up to 5 included users. Everything in Solo plus AI Second Opinion, pre-purchase inspections, parts tools, warranty/comeback tracking, templates, team accounts, CARFAX-ready tools, and training.
- **Pro / Fleet — $129.99/month:** up to 15 included users. Everything in Shop plus fleet, roadside/tow workflow, advanced reporting, and priority support.

The core workflow—customer intake → job → diagnosis → estimate → customer approval—remains available on every paid plan. Higher-value features are gated by plan rather than charging for every individual button.

## Production flows already connected

- Supabase Auth signup/login/logout
- Multi-shop tenant isolation with immutable `shop_id`
- 60-day trials and plan catalog
- Shop-specific customer intake links
- Secure intake queue and conversion into customer/vehicle/job records
- Technician findings saved to Supabase
- Good / Better / Best estimate snapshots
- Secure cross-device customer estimate approval links with expiration/versioning
- Supabase Edge Function for public estimate decisions
- Pricing and feature gates loaded from the Supabase plan catalog
- GitHub Actions JavaScript/required-file validation

## Production services still required or being completed

1. Stripe subscriptions, checkout, webhooks, retries, upgrades/downgrades, and cancellation.
2. Production AI provider through server-side functions with plan-based usage controls.
3. Secure staff invitations/password management.
4. Supabase Storage for photos, receipts, logos, and inspection evidence.
5. Authorized CARFAX connection before any service record can be marked Submitted.
6. Optional SMS/email, paid VIN/plate, parts inventory, maps, and legitimate service-data integrations.

## Security

Never commit Stripe secrets, AI provider keys, CARFAX credentials, Supabase service-role keys, or other private credentials to GitHub. Client code uses only the Supabase publishable key; privileged operations must remain server-side or inside protected Supabase functions/Edge Functions.
