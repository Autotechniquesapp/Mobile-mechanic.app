# Mobile Mechanic AI

Mobile Mechanic AI is a multi-shop automotive workflow platform for mobile mechanics, repair shops, and fleet service operations. The production path uses GitHub → Netlify for the frontend and Supabase for authentication, tenant-isolated data, customer intake, and secure estimate approvals.

## Production deployment

- Repository: `Autotechniquesapp/Mobile-mechanic.app`
- Production branch: `main`
- Netlify publishes the repository root using `netlify.toml`
- Supabase provides Auth/Postgres/RLS and customer-facing Edge Functions

## Subscription pricing and trial policy

New shops receive a 60-day trial of the plan they select.

- **Days 1–30:** completely free. No credit card is required, requested, or collected.
- **Days 31–60:** the trial remains free, but the shop is asked to add a card for uninterrupted service.
- **After day 60:** recurring monthly billing begins automatically if a card/subscription was set up. A shop may cancel before paid billing begins.
- Stripe checkout is server-enforced so a new shop cannot be sent to card collection during the first 30 days.

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
- Technician Help UI and protected server-side AI endpoint (requires OpenAI secret before live answers)
- Stripe billing and signed webhook Edge Functions (requires Stripe secrets before live charges)
- GitHub Actions JavaScript/required-file validation

## Production services still required or being completed

1. Add Stripe secret key and webhook signing secret to activate live/test Stripe billing.
2. Add OpenAI API key to activate Technician Help and production AI responses.
3. Connect production email and SMS providers to deliver queued messages.
4. Supabase Storage for photos, receipts, logos, and inspection evidence.
5. Authorized CARFAX connection before any service record can be marked Submitted.
6. Optional QuickBooks, paid VIN/plate, parts inventory/supplier, maps, calendar-provider, and legitimate service-data integrations.

## Security

Never commit Stripe secrets, AI provider keys, CARFAX credentials, Supabase service-role keys, or other private credentials to GitHub. Client code uses only the Supabase publishable key; privileged operations must remain server-side or inside protected Supabase functions/Edge Functions.
