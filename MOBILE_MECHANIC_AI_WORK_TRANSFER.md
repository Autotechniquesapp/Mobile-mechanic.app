# Mobile Mechanic AI — Current Work Transfer Summary

## Core direction

Build **Mobile Mechanic AI** as a low-cost, multi-shop automotive web application hosted at `mobile-mechanic.app` with GitHub Pages. It is intended for independent mobile mechanics, repair shops, and eventually fleet/roadside operations. The app should be a practical technician assistant, not an overloaded traditional CRM.

## Approved visual design is mandatory

The uploaded approved screenshots are the visual source of truth. Do not replace them with a generic SaaS dashboard.

Mechanic/shop side:
- black / near-black background
- charcoal cards
- thin gray borders
- red primary accents and red line icons
- compact professional automotive/AI look
- Mobile Mechanic AI vehicle+wrench+AI logo
- mobile-first navigation with dashboard/jobs/calendar/customers/reports/more
- tablet/desktop side rail where appropriate

Customer-facing forms:
- clean white/light background
- red primary actions and section accents
- still branded as the exact shop that sent the intake/estimate

New features must fit into this approved appearance; do not redesign the app around the features.

## Platform / multi-shop architecture

This is a true multi-tenant platform. Many unrelated shops need to use one Mobile Mechanic AI application without seeing each other's records.

Every shop gets:
- immutable internal `shop_id`
- readable shop slug
- private workspace
- owner login
- technician/staff logins
- customers
- vehicles
- jobs
- estimates/invoices
- photos/receipts/reports
- settings and pricing defaults
- unique customer intake link

Production database security must enforce `shop_id` server-side / database-side, not only filter records in browser JavaScript.

Example intake URL:
`mobile-mechanic.app/?intake=desert-auto`

The shop slug routes the request, while records belong to the immutable shop ID.

## Platform Owner / Super Admin

The Mobile Mechanic AI owner needs a special Platform Owner account that:
- never pays a subscription
- does not consume shop seats
- can see platform-level shop/account/subscription status
- can extend trials
- comp accounts
- suspend/reactivate shops
- change plans
- enter a shop workspace for support
- see active shops, trial counts, subscription status, technician counts, and recurring-revenue overview

Production Platform Owner login must use secure authentication and preferably 2FA. Do not hard-code the real password in frontend files.

Public platform emails can later be:
- `support@mobile-mechanic.app`
- `billing@mobile-mechanic.app`
- `notifications@mobile-mechanic.app`

The Platform Owner's private login email does not need to be public.

## Shop signup and 60-day trial

Each new shop creates:
- business/shop name
- owner name
- owner email
- phone
- password
- selected plan

Start a 60-day free trial and record:
- trial start
- trial end
- days remaining
- plan
- subscription status

Do not delete customer/shop records if payment stops. Restrict paid functionality and retain data.

## Subscription pricing

### Solo — $29.99/month
- up to 1 user
- core customer intake
- AI diagnostic workflow
- quotes/invoices
- scheduling
- basic reports

### Shop — $69.99/month
- up to 5 users
- everything in Solo
- shared shop workspace
- technician assignments
- branding
- expanded reporting/integrations

### Pro / Fleet — $129.99/month
- up to 15 users
- everything in Shop
- fleet
- roadside/tow tools
- advanced reports/integrations
- multiple-location capability later

Possible additional seats later: about $10–$15 per user/month.

## Stripe / automatic payments

Use Stripe for Mobile Mechanic AI subscription payments so the platform does not require manual payment approval every month.

Desired behavior:
- automatic recurring billing
- failed-payment retries
- grace period
- account/subscription gating
- upgrades and downgrades
- cancellation
- trial conversion
- deposits to platform owner's bank account

Mobile Mechanic AI subscription payments are separate from automotive-customer payments to each shop.

Customer repair money must go to that shop's own payment method/account and not become platform subscription revenue.

## Subscription/legal protections

Shop signup must require acceptance and version/time recording for:
- Terms of Service
- Privacy Policy
- Data Collection & Use Policy
- recurring billing authorization
- trial terms
- cancellation policy
- payments generally non-refundable except where required by law
- AI-use limitation
- intellectual-property protections
- limitation of liability / warranty disclaimers / appropriate indemnification language
- suspension/termination for nonpayment, fraud, abuse, or unlawful use

Do not phrase refund terms as "absolutely no refunds under any circumstances." Use "non-refundable except where required by law" or attorney-approved equivalent.

## Professional responsibility setup screen

Keep the approved setup/protections screen style and required acknowledgments:
- AI tools provide suggestions, not answers
- use your own professional judgment
- mechanic/shop is responsible for safety and compliance
- Mobile Mechanic AI is not responsible for shop workmanship/damages/claims to extent permitted by law
- confirm charges before work
- do not rely solely on the app for critical/safety-sensitive information
- official service information should be consulted when required

Allow shop identity setup:
- shop name
- technician/owner name
- phone
- email
- logo upload
- theme customization

## Shop users / technician logins

A technician seat must be a real account, not just a name in a list.

When Shop Owner/Manager selects Add Technician:
- name
- email/username
- role
- temporary password or invite

Production flow should email a secure invite so the employee sets their own password.

Roles:
- Shop Owner
- Manager
- Technician
- Service Writer

Users always belong to one `shop_id` and cannot access another shop.

## Shop-specific customer intake

Every shop has its own intake link. When a shop sends it, the customer sees that shop's:
- name
- logo
- phone/contact identity

Submission goes to only that shop.

Intake fields:
- customer name
- phone
- email
- service location/current location
- availability date/time
- year (1930 through current/current+1)
- make
- model
- trim/submodel
- engine
- 2WD/FWD/RWD/4WD/AWD/Other
- VIN
- plate
- mileage
- Customer States complaint
- repair/diagnostic vs. pre-purchase inspection request

Always allow Other/manual entry when vehicle dropdown data is incomplete.

## Returning customers / multiple vehicles

If a customer already exists, allow another vehicle to be added without creating a duplicate person record.

Returning customers can create new Customer States jobs for an existing vehicle.

## VIN / plate / location

Support:
- VIN manual entry
- VIN scan later
- plate manual entry
- plate scan later
- browser current location with permission

A low-cost basic VIN decode can use NHTSA vPIC. Do not pretend plate lookup or scanner APIs are connected until they really are.

## Customer States + voice

Customer can type or speak their complaint.

Technicians can also dictate findings/notes.

Voice transcription becomes text and is stored with the job. Browser speech support can be used for prototype; production provider can be added only if needed.

## AI pre-workup

After customer intake, generate a preliminary technician-facing workup with:
- symptom summary
- likely areas to investigate
- diagnostic path/checklist
- codes/scan-data context
- possible parts
- labor/estimate starting point
- safety concerns
- relevant service-data prompts

AI is never final diagnosis. Technician must review/edit/approve.

## AI Second Opinion

Include a button that challenges the initial diagnosis:
- what could be overlooked?
- what else can produce the symptom?
- what should be tested before replacing the part?
- what commonly gets misdiagnosed?

Also include a "Before You Replace It" checklist for expensive components such as ECMs, transmissions, turbos, ABS modules, etc.

## Ask AI about this vehicle

Inside a vehicle/job record, technician can ask AI questions without re-entering context. Production AI should automatically receive permitted context such as:
- vehicle identity
- mileage
- complaint
- codes
- prior repairs
- previous diagnostic history
- current technician findings
- current estimate/job state

## YouTube repair videos

Inside AI workup and technician findings, provide vehicle/job-specific YouTube repair/diagnosis videos or search results using:
- year
- make
- model
- engine
- codes
- complaint
- repair being considered

A low-cost implementation can open targeted YouTube searches without paying for a YouTube API.

Display a reminder that videos are supplemental only and technicians must verify safety procedures, torque specs, fluid capacities, and authoritative service information independently.

## Technician findings

Support:
- typed findings
- voice findings
- codes
- scan/tool readings
- measurements
- test results
- before/after photos
- video later
- severity categories

Suggested categories:
- Good
- Monitor
- Needs Attention
- Safety Concern

## Diagnostic history

Vehicle record should preserve chronological:
- complaint
- codes
- freeze-frame/scan info when available
- tests
- measurements
- findings
- repairs
- approvals
- photos
- invoices
- CARFAX status
- future recommendations

## Good / Better / Best estimate workflow

Technician/AI can prepare:
- Good — minimum appropriate repair
- Better — recommended repair
- Best — more complete/preventive package where appropriate

Mechanic reviews all pricing before sending.

Must also support sending only one estimate when Good/Better/Best is not appropriate.

## Send estimates to customer + authorization

Mechanic can select Send to Customer.

Customer receives a shop-branded secure estimate link showing:
- vehicle
- repair options
- exact price
- what's included
- warranty info if applicable
- shop notes

Customer can select Good, Better, or Best and authorize the chosen option.

Record in production:
- estimate version
- selected option
- exact price/scope shown
- customer name
- date/time
- authorization status/signature when applicable

Also provide:
- Decline All
- Contact Shop

If price/scope changes after approval, require revised authorization rather than silently changing an approved estimate.

After approval, selected option becomes the active work order. Other options remain in history but are not authorized work.

## Deposits and customer repair payments

Shop can configure:
- parts paid upfront
- 50–70% style deposit
- custom deposit percentage/amount
- balance on completion

Possible customer payment options later:
- Square
- PayPal
- Venmo
- Cash App
- Zelle

The shop's customer money belongs directly to the shop.

## Quotes, markup, labor, travel

Shop controls:
- labor rate
- minimum labor
- diagnostic fee
- parts markup
- shop supplies/consumables
- travel/service-call fee
- free radius
- mileage/distance pricing later
- after-hours fee later
- deposit percentage
- tax

AI labor time is advisory only. Shop controls final pricing.

## Parts sourcing and warranty/receipt vault

Support surfaces for:
- nearby AutoZone
- O'Reilly
- NAPA
- Advance Auto Parts
- dealerships
- other local suppliers

Only show real-time price/availability when a legitimate API/source confirms it.

Store:
- supplier receipt
- part number
- purchase date
- warranty
- installed vehicle/job
- technician
- core charge and return status

## Warranty / comeback

Allow job to be marked:
- Warranty
- Comeback
- Recheck

Connect to original repair and record whether issue is:
- part warranty
- labor warranty
- diagnosis follow-up
- unrelated failure

## Technician timer / profitability

Eventually support start/pause/resume/complete time tracking and compare estimated labor with actual technician time.

Private shop profitability view can include:
- parts cost
- parts sell price
- labor revenue
- technician time
- travel cost
- estimated gross profit

Never expose internal cost/profit to customer.

## Pre-purchase inspection

Dedicated flow with:
- customer info
- vehicle info
- VIN
- seller/vehicle-owner contact
- location
- mileage
- required photos
- scan results
- road test
- safety issues

Inspection areas:
- body/exterior
- interior
- engine/fluids
- transmission/driveline
- brakes
- tires/wheels
- steering/suspension
- electrical/battery
- HVAC
- scan all modules
- road test
- safety concerns

AI can turn findings into a customer-friendly summary after technician review.

## Recall / TSB / service data

Provide integration points for:
- recalls
- TSBs
- torque specs
- capacities
- procedures

Do not present unverified AI-generated specifications as authoritative. Use legitimate service-data sources before production claims.

## CARFAX-ready reporting

Completed job can prepare a service record with:
- VIN
- mileage
- service date
- shop identity
- repairs/services performed

Status should clearly say:
- Ready
- Submitted
- Failed
- Not Connected

Do not mark Submitted unless an authorized CARFAX connection confirms submission. CARFAX record must identify the actual shop that performed the service, not the platform owner's account.

## Scheduling and customer updates

Customer intake includes availability. Shop confirms appointment.

Later customer-update buttons can send:
- Technician Arrived
- Diagnosis Underway
- Waiting for Approval
- Parts Acquired
- Repair Underway
- Vehicle Ready

Calendar integration can be added once core app is stable.

## Declined work + maintenance follow-up

Store declined recommendations with date/time and findings.

Later use them for:
- follow-up
- maintenance reminders
- documentation
- customer communication

## Review request / follow-up

After completed repair, optionally send:
- thank-you message
- review request
- future maintenance reminder

Keep it optional/configurable per shop.

## Fleet / roadside

Pro/Fleet supports:
- fleet customers
- multiple units
- unit numbers
- diesel/semi capability
- drivers
- locations
- maintenance history
- scheduled maintenance
- AI intake
- roadside jobs

Tow handoff includes:
- customer/driver
- vehicle/unit
- location
- destination
- reason it should not be driven
- technician notes

## Training / study

Optional module may include:
- ASE practice
- electrical diagnostics
- engine performance
- brakes
- HVAC
- EPA Section 609 study resources

Do not falsely claim Mobile Mechanic AI issues official ASE or EPA certifications unless formally authorized.

## Shop templates

Shops can save common packages such as:
- brakes
- oil service
- AC diagnostic
- no-start diagnostic
- pre-purchase inspection

Templates can include labor, supplies, markup, and disclaimers.

## Offline / poor signal

Important future feature for mobile mechanics:
- locally queue notes/findings/photos
- sync when connection returns

## Shop data export / backup

Shop should be able to export its own:
- customers
- vehicles
- jobs
- invoices
- service records

Shop owns its business records. It receives a license to use Mobile Mechanic AI while authorized but does not own/copy/resell the platform software.

## Hosting / domain / cost strategy

Current domain: `mobile-mechanic.app`

Production hosting and deployment use GitHub Pages from the `main` branch. DNS for `mobile-mechanic.app` must point only to the active GitHub Pages deployment. Do not add or restore another hosting provider.

Keep operating costs minimal so subscriptions pay for the platform.

Recommended lean production stack:
- GitHub Pages for frontend hosting and Supabase Edge Functions for server-side operations
- Supabase for auth/database/storage
- Stripe for subscriptions
- NHTSA vPIC for basic free VIN decode where sufficient
- targeted YouTube search links rather than a paid video integration at first
- paid AI/VIN/plate/SMS/CARFAX/parts APIs only when revenue justifies them


## Security rules

Never put secret API keys in browser JavaScript.

Keep server-side:
- Stripe secret key
- AI provider key
- CARFAX credentials
- paid vehicle-data credentials
- SMS/email credentials

Production passwords must use proper auth/hashing. Prototype localStorage credentials are only for visual/function testing.

## Immediate build priority

1. Match approved screenshots closely.
2. Keep mechanic side black/red and customer side white/red.
3. Make shop login/signup/technician accounts work.
4. Make true tenant separation production-ready.
5. Make shop-specific intake routing work.
6. Finish intake → AI pre-workup → findings → Good/Better/Best → customer approval → work order → invoice/completion.
7. Secure Platform Owner/Super Admin.
8. Connect Stripe subscription backend.
9. Connect low-cost auth/database backend.
10. Add external APIs only when real and justified.
11. Test every navigation/action on mobile before production use.

## Product philosophy

Mobile Mechanic AI should feel like a capable digital assistant beside the technician. It should help gather information, reason through diagnosis, challenge misdiagnoses, document evidence, find relevant repair videos, build estimates, obtain authorization, perform inspections, record service history, protect the shop, and get the mechanic paid—while keeping the mechanic in control of all professional decisions.
