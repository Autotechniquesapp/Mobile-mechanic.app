# Mobile Mechanic AI — Working Front-End Build

This update replaces the dead-button prototype with a functional browser-based front-end.

## Working in this build
- Customer intake fields persist locally
- VIN decoding through the public NHTSA vPIC API
- Browser geolocation capture
- Browser speech-to-text when supported
- Photo/video/document file selection and attachment listing
- Immediate local diagnostic pre-workup
- Repair-video YouTube search
- Editable parts and labor
- Add/remove parts and labor lines
- Estimate recalculation
- Customer approval with timestamp
- Shareable approval/intake links
- Payment method selection and payment recording
- Receipt/job-summary sharing
- Print / Save PDF through the browser
- Business settings saved in localStorage
- Repair, Maintenance, PPI, Roadside, and Fleet/Diesel intake modes

## Still requires real external service credentials
- Production AI model/API
- Square/payment processing
- CARFAX or another authorized service-history reporting provider
- Cloud database/authentication

These cannot be made genuinely live from front-end files alone without the corresponding accounts, API credentials, and backend.
