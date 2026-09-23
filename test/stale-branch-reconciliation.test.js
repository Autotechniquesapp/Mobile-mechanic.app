const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('stripe-billing.js','utf8');
const guards=fs.readFileSync('production-guards.js','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');
const intakeSchedule=fs.readFileSync('intake-scheduling.js','utf8');
const admin=fs.readFileSync('admin.js','utf8');
const integrations=fs.readFileSync('quickbooks-integration.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const mcpFrontend=fs.readFileSync('mcp-connections.js','utf8');
const mcpBackend=fs.readFileSync('supabase/functions/mcp-connections/index.ts','utf8');
const businessBackend=fs.readFileSync('supabase/functions/business-integrations/index.ts','utf8');
const qboBackend=fs.readFileSync('supabase/functions/quickbooks-oauth/index.ts','utf8');
const xeroBackend=fs.readFileSync('supabase/functions/xero-oauth/index.ts','utf8');
const paypalBackend=fs.readFileSync('supabase/functions/paypal-onboarding/index.ts','utf8');
const googleBackend=fs.readFileSync('supabase/functions/google-business-oauth/index.ts','utf8');

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
    'supabase/functions/platform-admin/index.ts',
    'supabase/functions/google-business-oauth/index.ts'
  ]) assert.ok(fs.existsSync(path), `missing production source: ${path}`);
});


test('MCP connected-app source is loaded cleanly and validated',()=>{
  assert.match(html,/src="mcp-connections\.js/);
  assert.equal(html.includes('</script>\\n  <script src="mcp-connections.js'),false);
  assert.match(pkg.scripts.check,/node --check mcp-connections\.js/);
  assert.match(pkg.scripts.check,/supabase\/functions\/mcp-connections\/index\.ts/);
});


test('connected-account requests use the selected shop instead of first membership',()=>{
  assert.match(mcpFrontend,/shop_id/);
  assert.match(integrations,/body:\{\.\.\.body,shop_id\}/);
  for(const source of [mcpBackend,businessBackend,qboBackend,xeroBackend,paypalBackend,googleBackend]){
    assert.match(source,/\.eq\("shop_id",\s*shopId\)/);
  }
  assert.doesNotMatch(mcpBackend,/\.eq\("status", "active"\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(businessBackend,/\.eq\("status","active"\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(qboBackend,/\.eq\("status","active"\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(xeroBackend,/\.eq\("status","active"\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(paypalBackend,/\.eq\("status","active"\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.doesNotMatch(googleBackend,/\.eq\("status","active"\)\.limit\(1\)\.maybeSingle\(\)/);
});
