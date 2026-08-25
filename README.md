# Mobile Mechanic AI

GitHub-ready mobile web app matching the approved red-and-black workflow.

## Included working prototype flows

- Mechanic protections and agreements
- Customer intake with VIN decoding, 1930+ year selection, vehicle dropdowns and manual fallbacks
- Voice complaint and technician findings where the browser supports speech recognition
- Current-location capture and address lookup
- AI-style local diagnostic pre-workup with technician disclaimer
- Nearby parts search and repair-video search
- Technician findings, editable parts/labor estimate, approval and in-person signature
- Invoice, payment selection, printable receipt and completed-job summary
- Pre-purchase inspection checklist with photos and quote creation
- Roadside/tow intake with nearby tow-truck search
- Fleet/semi-diesel intake with company, unit, USDOT and equipment fields
- Customer alerts, vehicle history and CARFAX-ready pending report
- Browser storage so test data survives refreshes

## Test locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy with GitHub Pages

Push these files to the repository's default branch. The included Pages workflow publishes the site automatically. In GitHub, set **Settings → Pages → Source** to **GitHub Actions** if needed.

## Production connections still required

Real AI, payment processing, SMS/email, customer accounts/cloud storage and CARFAX reporting require private provider credentials and a secure backend. The static build labels these connections honestly and does not expose API keys in browser code.
