# Mobile Mechanic AI — Build Status

Status date: 2026-08-26

This document distinguishes working code from interface foundations. An integration is not considered connected until its configured provider confirms a real request.

## Implemented in this build

| Area | Status | Notes |
|---|---|---|
| Approved brand direction | Implemented | Dark charcoal/black and red-glow mechanic interface; white/red intake; mobile-first navigation and cards. Exact screenshot comparison still requires the approved screenshots to be attached to the working session. |
| Mechanic protection | Implemented | Required advisory, verification, safety, authorization, and professional-judgment acknowledgments. Production legal text still needs attorney review. |
| Shop signup/login | Implemented, configuration required | Secure server endpoints use Supabase Auth and HttpOnly session cookies. Signup bootstraps a permanent shop and 60-day trial. |
| Multi-shop isolation | Implemented in schema | Every business record carries `shop_id`; RLS and composite tenant foreign keys prevent cross-shop relationships. Must still be adversarially tested in staging. |
| Shop roles | Implemented in schema | Shop Owner, Manager, Technician, and Service Writer. |
| Technician invitations | Implemented, configuration required | Real Supabase invite, plan seat limits, validated pending invitation, and role assignment. Invitation metadata alone cannot grant shop access. |
| Platform admin roles | Implemented in schema/interface foundation | Owner, Billing, Support, Operations, Technical, and Read-Only roles plus access grants and activity log. High-risk production actions still need dedicated reauthentication endpoints. |
| Shop intake URL | Implemented, configuration required | `/intake/:slug` resolves public shop branding and submits only through a server-side tenant transaction. |
| Returning customers | Implemented in intake transaction | Matches within the destination shop by normalized phone/email and supports multiple vehicles. |
| Vehicle intake | Implemented | Years 1930–current year, cascading sample catalog, drivetrain, VIN, plate, mileage, and always-available Other values. |
| VIN decode | Implemented, live public source | Netlify Function calls NHTSA vPIC and reports partial/no-result states honestly. Technician must review returned values. |
| Plate lookup/OCR | Not connected | Typing and camera capture points exist; no lookup or OCR success is claimed. |
| Location | Implemented in browser | Uses browser geolocation only after customer permission. |
| Voice complaint | Implemented where supported | Uses browser speech recognition and places transcription into Customer States. Typed entry remains available. |
| AI workup | Implemented, configuration required | Authenticated server-side OpenAI Responses request, tenant/job persistence, ordered checklist, safety flags, causes, parts hypotheses, labor/estimate wording, and advisory disclaimer. |
| AI Second Opinion | Implemented, configuration required | Challenges diagnosis and highlights overlooked tests/misdiagnoses. |
| Before You Replace It | Implemented, configuration required | Requires the expensive component and asks for confirmation tests before condemnation. |
| Technician findings | Interface foundation | Typed findings and evidence affordances are present; complete storage/upload workflows remain a later milestone. |
| Good/Better/Best | Interface foundation | Editable mechanic-side cards and pricing presentation exist; versioned send/approval backend is not yet connected. |
| Estimates/authorizations | Schema foundation | Versioned estimates, options, exact price, item decisions, signature path, timestamp, and superseded states are modeled. Public approval endpoint is not yet implemented. |
| Invoices/deposits | Schema/settings foundation | Data model and shop deposit settings exist; invoice creation/payment collection UI and provider connections remain. |
| Core/warranty/receipt vault | Schema foundation | Tenant-safe records are modeled; full UI, reminders, and storage upload are not complete. |
| Offline shell | Foundation | Static application shell is cached. Full queued writes/photos and conflict resolution are not implemented. |
| Automated checks | Implemented | JavaScript syntax and server-function smoke checks run without production credentials. |

## Explicitly not connected

- Stripe subscriptions, webhooks, plan changes, and trial gating
- Automotive-customer payment providers
- CARFAX submission
- License-plate lookup
- VIN/plate image OCR
- SMS and transactional email delivery
- Live parts pricing or inventory
- Maps, routing, and travel-distance calculation
- Embedded YouTube Data API results (the interface uses a reference search link only)
- Recall/TSB provider beyond future integration points
- Authoritative service specifications or labor guides
- Calendar integration

These areas must continue to display **Not Connected**, a clear interface-only state, or an external reference link until a valid provider confirms the action.

## Next build sequence

1. Attach the approved screenshots and complete pixel-level visual comparison.
2. Create or authorize the correct repository under `Autotechniquesapp`; confirm its exact name and content.
3. Apply the Supabase schema in staging and configure Auth.
4. Connect staging environment variables to the existing Netlify site or a deploy preview.
5. Run two-shop isolation, role, invite, intake, and AI tests end to end.
6. Implement versioned customer estimate delivery and authorization.
7. Add findings/evidence storage, scheduling, invoices, deposits, warranty/comeback, and service timeline.
8. Add Stripe subscriptions and webhook-driven 60-day trial gating in test mode.
9. Complete real-device mobile/accessibility/offline QA.
10. Promote only a verified `main` build to the existing `mobile-mechanic.app` Netlify project.
