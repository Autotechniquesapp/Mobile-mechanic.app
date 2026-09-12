import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { safeReturn, claimState } from '../supabase/functions/_shared/oauth-safety.ts';

const base = new URL('../supabase/functions/', import.meta.url);
const fallback = 'https://mobile-mechanic.app/#settings';

function database(provider, options = {}) {
  const state = { state_token: 'nonce', provider, shop_id: 'shop-a', user_id: 'user-a',
    consumed_at: null, expires_at: new Date(Date.now() + 60000).toISOString(), return_url: fallback,
    ...options.state };
  const writes = [];
  const db = { state, writes, from(table) {
    let method = 'select', value, filters = [];
    const query = {
      select() { return this; },
      update(v) { method = 'update'; value = v; return this; },
      upsert(v) { method = 'upsert'; value = v; return this; },
      insert(v) { method = 'insert'; value = v; return this; },
      delete() { method = 'delete'; return this; },
      eq(k,v) { filters.push(r => r[k] === v); return this; },
      is(k,v) { filters.push(r => r[k] === v); return this; },
      gt(k,v) { filters.push(r => r[k] > v); return this; },
      limit() { return this; },
      maybeSingle() { return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (options.failTable === table) return { data: null, error: { message: 'private database detail' } };
          if (table.endsWith('oauth_states') && method === 'update') {
            if (!filters.every(f => f(state))) return { data: null, error: null };
            Object.assign(state, value);
            return { data: { ...state }, error: null };
          }
          if (table === 'shop_members') {
            const member = { user_id: 'user-a', shop_id: 'shop-a', role: options.role || 'shop_owner', status: 'active' };
            return { data: !options.removed && filters.every(f => f(member)) ? member : null, error: null };
          }
          if (method !== 'select') writes.push({ table, method, value });
          return { data: null, error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  } };
  return db;
}

async function handler(slug, db, responses = [], envOverrides = {}) {
  let serve;
  const calls = [];
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    SUPABASE_ANON_KEY: 'anon-test', XERO_CLIENT_ID: 'client', XERO_CLIENT_SECRET: 'secret-test',
    QUICKBOOKS_CLIENT_ID: 'client', QUICKBOOKS_CLIENT_SECRET: 'secret-test',
    PAYPAL_CLIENT_ID: 'client', PAYPAL_CLIENT_SECRET: 'secret-test', PAYPAL_PARTNER_ID: 'partner',
    ...envOverrides };
  const context = vm.createContext({
    URL, URLSearchParams, Response, Request, Date, crypto, btoa,
    console: { error() {} },
    Deno: { env: { get: key => env[key] }, serve: fn => { serve = fn; } },
    createClient: (_url, key) => key === 'service-test' ? db : { auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      assert.ok(next, 'Unexpected provider request');
      return Response.json(next.body, { status: next.status || 200 });
    }
  });
  const helper = await readFile(new URL('_shared/oauth-safety.ts', base), 'utf8');
  const source = await readFile(new URL(slug + '/index.ts', base), 'utf8');
  vm.runInContext(stripTypeScriptTypes(helper.replaceAll('export ', '') + '\n' + source.replace(/^import .*;\n/gm, '')), context);
  return { run: (query = '', body) => serve(new Request('https://example.supabase.co/functions/v1/' + slug + query,
    body ? { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' }, body: JSON.stringify(body) } : undefined)), calls };
}

test('return URL requires the exact app origin without user info', () => {
  for (const value of [null, '', 'https://mobile-mechanic.app.attacker.test/', 'https://mobile-mechanic.app@attacker.test',
    'https://user@mobile-mechanic.app/', 'http://mobile-mechanic.app/', 'https://mobile-mechanic.app:444/', '//mobile-mechanic.app/', 'javascript:alert(1)']) {
    assert.equal(safeReturn(value), fallback);
  }
  assert.equal(safeReturn('https://mobile-mechanic.app/?tab=accounts#settings'), 'https://mobile-mechanic.app/?tab=accounts#settings');
});

test('state claim is single-use even for concurrent callbacks', async () => {
  const db = database('xero');
  const a = claimState(db, 'integration_oauth_states', 'xero', 'nonce');
  const b = claimState(db, 'integration_oauth_states', 'xero', 'nonce');
  assert.equal((await Promise.all([a,b])).filter(Boolean).length, 1);
});
for (const [name, options, provider] of [
  ['expired', { state: { expires_at: '2000-01-01T00:00:00Z' } }, 'xero'],
  ['consumed', { state: { consumed_at: '2026-01-01' } }, 'xero'],
  ['wrong provider', {}, 'paypal'],
  ['removed member', { removed: true }, 'xero'],
  ['technician', { role: 'technician' }, 'xero'],
  ['wrong shop', { state: { shop_id: 'shop-b' } }, 'xero']
]) test('state rejects ' + name, async () => {
  assert.equal(await claimState(database('xero', options), 'integration_oauth_states', provider, 'nonce'), null);
});

const token = { body: { access_token: 'provider-test-token', refresh_token: 'refresh-test', expires_in: 1800 } };
for (const slug of ['xero-oauth', 'quickbooks-oauth', 'paypal-onboarding']) {
  const provider = slug.split('-')[0];
  test(slug + ' does not call provider on invalid state', async () => {
    const h = await handler(slug, database(provider, { state: { consumed_at: 'already' } }));
    const response = await h.run('?state=nonce&merchantId=nonce&merchantIdInPayPal=seller&code=code&realmId=realm');
    assert.equal(response.status, 302);
    assert.equal(h.calls.length, 0);
  });
  test(slug + ' rejects failed state persistence before authorization', async () => {
    const db = database(provider, { failTable: provider === 'paypal' ? 'payment_oauth_states' : 'integration_oauth_states' });
    const h = await handler(slug, db);
    const response = await h.run('', { action: 'connect', return_url: fallback });
    assert.equal(response.status, 500);
    assert.equal(h.calls.length, 0);
    assert.doesNotMatch(await response.text(), /private database detail/);
  });
}

for (const [name, connection] of [
  ['no organizations', { body: [] }],
  ['multiple organizations', { body: [{ tenantId: 'a' }, { tenantId: 'b' }] }],
  ['provider error', { status: 401, body: { message: 'invalid token' } }],
  ['missing tenant ID', { body: [{}] }]
]) test('Xero rejects ' + name, async () => {
  const db = database('xero');
  const h = await handler('xero-oauth', db, [token, connection]);
  assert.equal((await h.run('?state=nonce&code=code')).status, 302);
  assert.ok(db.writes.some(w => w.value.status === 'needs_attention'));
  assert.ok(!db.writes.some(w => w.table === 'shop_integration_credentials'));
});
test('Xero saves verified organization without claiming accounting sync', async () => {
  const db = database('xero');
  const h = await handler('xero-oauth', db, [token, { body: [{ tenantId: 'a', tenantName: 'Shop A' }] }]);
  assert.equal((await h.run('?state=nonce&code=code')).status, 302);
  const connected = db.writes.find(w => w.value.status === 'connected').value;
  assert.equal(connected.external_account_id, 'a');
  assert.equal(connected.last_synced_at, null);
  assert.equal(connected.public_settings.sync_available, false);
});
test('QuickBooks requires successful company verification', async () => {
  const db = database('quickbooks');
  const h = await handler('quickbooks-oauth', db, [token, { status: 403, body: {} }]);
  await h.run('?state=nonce&code=code&realmId=realm');
  assert.ok(db.writes.some(w => w.value.status === 'needs_attention'));
  assert.ok(!db.writes.some(w => w.table === 'shop_integration_credentials'));
});
test('QuickBooks saves a verified company without claiming sync', async () => {
  const db = database('quickbooks');
  const h = await handler('quickbooks-oauth', db, [token, { body: { CompanyInfo: { CompanyName: 'Shop A' } } }]);
  await h.run('?state=nonce&code=code&realmId=realm');
  assert.equal(db.writes.find(w => w.value.status === 'connected').value.last_synced_at, null);
});

const seller = { merchant_id: 'seller', tracking_id: 'nonce', payments_receivable: true, primary_email_confirmed: true,
  oauth_integrations: [{ integration_type: 'OAUTH_THIRD_PARTY',
    oauth_third_party: [{ partner_client_id: 'client', scopes: ['https://uri.paypal.com/services/payments/payment/authcapture'] }] }] };
const paypalQuery = '?merchantId=nonce&merchantIdInPayPal=seller&permissionsGranted=true&isEmailConfirmed=true&accountStatus=BUSINESS_ACCOUNT';
for (const [name, changes] of [
  ['wrong referral', { tracking_id: 'other-shop' }],
  ['wrong merchant', { merchant_id: 'other-seller' }],
  ['missing permissions', { oauth_integrations: [] }],
  ['email unconfirmed', { primary_email_confirmed: false }],
  ['payments blocked', { payments_receivable: false }]
]) test('PayPal refuses connected status for ' + name, async () => {
  const db = database('paypal');
  const h = await handler('paypal-onboarding', db, [token, { body: { ...seller, ...changes } }]);
  assert.equal((await h.run(paypalQuery)).status, 302);
  assert.ok(!db.writes.some(w => w.value.status === 'connected'));
  assert.ok(db.writes.some(w => w.value.status === 'needs_attention'));
});
test('PayPal uses server verification, not browser flags', async () => {
  const db = database('paypal');
  const h = await handler('paypal-onboarding', db, [token, { body: seller }]);
  await h.run('?merchantId=nonce&merchantIdInPayPal=seller');
  const saved = db.writes.find(w => w.value.status === 'connected').value;
  assert.equal(saved.external_account_id, 'seller');
  assert.equal(saved.capabilities.paypal, true);
  assert.equal(saved.capabilities.venmo, false);
  assert.equal(saved.capabilities.invoices, false);
  assert.match(h.calls[1].url, /partners\/partner\/merchant-integrations\/seller$/);
});
for (const slug of ['xero-oauth', 'quickbooks-oauth', 'paypal-onboarding']) {
  test(slug + ' does not claim connection after credential write failure', async () => {
    const provider = slug.split('-')[0];
    const db = database(provider, { failTable: provider === 'paypal' ? 'payment_processor_credentials' : 'shop_integration_credentials' });
    const payload = provider === 'paypal' ? seller : provider === 'xero' ? [{ tenantId: 'a' }] : { CompanyInfo: { CompanyName: 'Shop A' } };
    const h = await handler(slug, db, [token, { body: payload }]);
    assert.equal((await h.run('?state=nonce&code=code&realmId=realm&merchantId=nonce&merchantIdInPayPal=seller')).status, 500);
    assert.ok(!db.writes.some(w => w.value.status === 'connected'));
  });
}

test('technicians cannot enable business integrations', async () => {
  const db = database('quickbooks', { role: 'technician' });
  const h = await handler('business-integrations', db);
  const response = await h.run('', { action: 'enable', provider: 'twilio' });
  assert.equal(response.status, 403);
  assert.equal(db.writes.length, 0);
});

test('business catalog does not promise accounting sync', async () => {
  const h = await handler('business-integrations', database('quickbooks'));
  const response = await h.run('', { action: 'status' });
  const body = await response.json();
  for (const row of body.integrations.filter(r => ['quickbooks','xero'].includes(r.provider))) {
    assert.match(row.note, /sync is not available yet/);
  }
});

test('UI preserves actionable backend errors without requiring JSON responses', async () => {
  const source = await readFile(new URL('../quickbooks-integration.js', import.meta.url), 'utf8');
  for (const [context, expected] of [
    [Response.json({ error: 'Authorize your provider account first.' }, { status: 503 }), 'Authorize your provider account first.'],
    [new Response('Unavailable', { status: 503 }), 'Integration request failed.']
  ]) {
    const sandbox = vm.createContext({
      window: { MobileMechanicSupabase: { functions: { invoke: async () => ({ error: { context } }) } }, addEventListener() {} },
      document: { addEventListener() {}, documentElement: {} },
      MutationObserver: class { observe() {} },
      setTimeout() {}
    });
    vm.runInContext(source.replace('})();', 'globalThis.testInvoke = invoke;})();'), sandbox);
    await assert.rejects(sandbox.testInvoke('business-integrations', {}), { message: expected });
  }
});
