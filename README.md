# Mobile Mechanic AI

Mobile Mechanic AI is a multi-shop automotive workflow platform for mobile mechanics, repair shops, and fleet service operations.

## Current deployment

- Repository: `Autotechniquesapp/Mobile-mechanic.app`
- Production branch: `main`
- Frontend hosting now: GitHub / GitHub Pages only
- Domain: `mobile-mechanic.app`
- Backend: Supabase Auth/Postgres/RLS, Storage, and Edge Functions
- Netlify is not part of the current deployment
- Cloudflare is a future migration only, after the app is finished and tested

## Subscription pricing and trial policy

New shops receive a 60-day trial of the plan they select.

- **Days 1–30:** completely free. No subscription card is required, requested, or collected.
- **Days 31–60:** the trial remains free, but the shop is asked to add a subscription card for uninterrupted service.
- **After day 60:** recurring monthly billing begins automatically if a card/subscription was set up. A shop may cancel before paid billing begins.
- Stripe checkout is server-enforced so a new shop cannot be sent to subscription card collection during the first 30 days.
- Each new trial shop receives **$5 promotional AI credit**. AI credit purchases are separate one-time payments and do not start or shorten the free subscription trial.
- Shops can add prepaid AI balance in **$5 / $10 / $25 / $50** amounts. AI usage is metered per shop and debited from promotional credit first, then purchased credit.

Plans:

- **Solo — $29.99/month:** 1 included user. Customer intake, customers/vehicles/jobs, basic AI workup, Good/Better/Best estimates, secure customer approval, voice notes, quick quote, calendar, basic reporting, and data export.
- **Shop — $69.99/month:** up to 5 included users. Everything in Solo plus AI Second Opinion, pre-purchase inspections, parts tools, warranty/comeback tracking, templates, team accounts, CARFAX-ready tools, and training.
- **Pro / Fleet — $129.99/month:** up to 15 included users. Everything in Shop plus fleet, roadside/tow workflow, advanced reporting, and priority support.

The core workflow—customer intake → job → diagnosis → estimate → customer approval—remains available on every paid plan. Higher-value features are gated by plan rather than charging for every individual button.

## Production flows already connected

- Supabase Auth signup/login/logout
- Multi-shop tenant isolation with immutable `shop_id`
- 60-day trials and plan catalog
- First-30-days no-card enforcement for subscription checkout
- Shop-specific customer intake links
- Secure intake queue and conversion into customer/vehicle/job records
- Technician findings saved to Supabase
- Good / Better / Best estimate snapshots
- Secure cross-device customer estimate approval links with expiration/versioning
- Supabase Edge Function for public estimate decisions
- Pricing and feature gates loaded from the Supabase plan catalog
- Internal scheduling blocks with labor + travel + buffer time
- Staff invite records and queued email/SMS delivery
- Technician feedback / feature-request collection with platform-admin review
- Technician Help UI and protected server-side AI endpoint
- Stripe subscription billing and signed webhook Edge Functions
- Separate Stripe AI-credit top-up checkout and webhook handling
- Per-shop AI usage ledger, model-cost table, promotional/purchased credit buckets, and automatic new-shop trial credit
- GitHub Actions JavaScript/required-file validation
- Free Leaflet/OpenStreetMap mapping and nearby parts-store location lookup
- Free NHTSA vPIC VIN/model lookup
- AI quote + SMS workflow with browser/Android voice notes
- Gmail, Google Calendar, and Google Drive integrations
- Supabase Storage buckets and tenant-isolated policies for shop logos, job media, receipts, and inspection evidence

## Production services still required or being completed

1. Resolve the OpenAI API account-level `billing_not_active` response; the API key is present and Supabase is reaching OpenAI correctly.
2. Connect/register production automatic SMS if desired; device SMS fallback remains available without a platform SMS provider.
3. Move Supabase from Free to Pro when production traffic/storage/backups justify it.
4. Authorized CARFAX connection before any service record can be marked Submitted.
5. Optional QuickBooks/Xero, paid plate lookup, supplier inventory/pricing, and legitimate service-data integrations as demand requires.
6. After the app is finished and stable, optionally migrate frontend/domain hosting from GitHub Pages to Cloudflare.

## Security

Never commit Stripe secrets, AI provider keys, CARFAX credentials, Supabase service-role keys, or other private credentials to GitHub. Client code uses only the Supabase publishable key; privileged operations must remain server-side or inside protected Supabase functions/Edge Functions.
