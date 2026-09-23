const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('stripe-billing.js','utf8');
const guards=fs.readFileSync('production-guards.js','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');
const intakeSchedule=fs.readFileSync('intake-scheduling.js','utf8');
const admin=fs.readFileSync('admin.js','utf8');
const integrations=fs.readFileSync('quickbooks-integration.js','utf8');

test('first-100 launch billing UI matches production eligibility',()=>{
  assert.match(billing,/launch_promo_eligible/);
  assert.match(billing,/First-100 launch offer/);
  assert.match(billing,/Start Subscription/);
  assert.match(billing,/comped_permanent/);
});

test('obsolete Stripe-not-connected guards cannot intercept production billing',()=>{
  assert.doesNotMatch(guards,/Stripe billing is not connected yet/);
  assert.doesNotMatch(production,/Stripe billing is not connected yet/);
});

test('customer intake keeps the ASAP scheduling option',()=>{
  assert.match(intakeSchedule,/data-asap/);
  assert.match(intakeSchedule,/As soon as possible/);
});

test('platform owner UI is not coupled to the AutoTechniques shop slug',()=>{
  assert.match(admin,/Use your Platform Admin account/);
  assert.match(admin,/comped_permanent/);
  assert.doesNotMatch(admin,/const own=s\.slug==='autotechniques'/);
  assert.doesNotMatch(admin,/Attach Platform Owner \+ Autotechniques/);
});

test('integration UI preserves actionable backend errors',()=>{
  assert.match(integrations,/error\.context\?\.clone\(\)\.json\(\)/);
  assert.match(integrations,/typeof detail\?\.error==='string'/);
});

test('critical deployed OAuth and billing function source is tracked',()=>{
  for(const path of [
    'supabase/functions/_shared/oauth-safety.ts',
    'supabase/functions/quickbooks-oauth/index.ts',
    'supabase/functions/xero-oauth/index.ts',
    'supabase/functions/paypal-onboarding/index.ts',
    'supabase/functions/stripe-billing/index.ts',
    'supabase/functions/platform-admin/index.ts'
  ]) assert.ok(fs.existsSync(path), `missing production source: ${path}`);
});
