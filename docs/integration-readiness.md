# Integration readiness

This change hardens existing connection flows. It does not finish the SaaS or
implement accounting exports. Square, hosting and DNS are unchanged.

## Implemented

- Exact-origin application return URLs.
- Atomic, expiring, single-use OAuth state claims and callback membership checks.
- QuickBooks company verification and checked credential persistence.
- Xero organization verification; multiple organizations fail closed instead of
  silently selecting an accounting organization.
- PayPal seller status, tracking ID and payment permission verification using
  PayPal's server API. Browser callback flags are not proof of readiness.
- Accounting catalog copy distinguishes authorization from accounting sync.
- Backend error details are surfaced by the business integration UI.

## Required secure configuration

Use Supabase Edge Function secrets, never browser variables or committed files.

| Provider | Secret names | Registered OAuth callback |
| --- | --- | --- |
| QuickBooks | QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_ENVIRONMENT | https://rapcejqlydedceegbcrs.supabase.co/functions/v1/quickbooks-oauth |
| Xero | XERO_CLIENT_ID, XERO_CLIENT_SECRET | https://rapcejqlydedceegbcrs.supabase.co/functions/v1/xero-oauth |
| PayPal | PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_PARTNER_ID, PAYPAL_ENVIRONMENT; optional PAYPAL_BN_CODE | https://rapcejqlydedceegbcrs.supabase.co/functions/v1/paypal-onboarding |

QuickBooks and PayPal default to sandbox; production requires the matching
production credentials and environment value `production`. PayPal platform
partner approval is required for live multiparty operations.

## Still required before launch

- Provider developer applications, secure credentials and owner authorization.
- Sandbox and live-provider acceptance tests; mocked tests do not establish a
  real connection, completed payment or completed accounting sync.
- Accounting customer/invoice/payment mapping, idempotent export, tax handling,
  refresh/retry handling and reconciliation. No accounting data is currently synced.
- Xero explicit organization selection for accounts with multiple connections.
- PayPal re-verification after pending onboarding, revocation/webhook handling,
  checkout/capture/refund verification. Venmo and PayPal invoicing are not marked
  ready by this patch.
- Full app workflow and tenant-isolation acceptance testing.
- Hosting migration only after separate approval; do not change DNS with this patch.

## Verification and deployment

Run with Node 24:

```sh
node --test tests/integration-oauth.test.mjs
node --check quickbooks-integration.js
```

OAuth Edge Functions retain `verify_jwt = false` for provider GET callbacks;
POST requests use authenticated user checks. Keep `business-integrations` JWT
verification enabled. Include `_shared/oauth-safety.ts` when deploying the three
OAuth functions. Source commits do not themselves deploy Supabase functions.

Provider reference:
- https://developer.paypal.com/platforms/seller-onboarding/before-payment
- https://developer.xero.com/documentation/guides/oauth2/tenants
