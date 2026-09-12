const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const browser = fs.readFileSync('square-sync.js', 'utf8');
const processors = fs.readFileSync('payment-processors.js', 'utf8');
const invoiceFunction = fs.readFileSync('supabase/functions/square-invoice/index.ts', 'utf8');
const syncFunction = fs.readFileSync('supabase/functions/square-sync/index.ts', 'utf8');
const webhookFunction = fs.readFileSync('supabase/functions/square-webhook/index.ts', 'utf8');
const processorFunction = fs.readFileSync('supabase/functions/payment-processors/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202609100002_square_full_sync.sql', 'utf8');

test('the production shell loads the Square sync controller with the current cache version', () => {
  assert.match(html, /square-sync\.js\?v=20260912-square-tile1/);
  assert.match(html, /payment-processors\.js\?v=20260912-square-tile1/);
  assert.match(html, /styles\.css\?v=20260912-square-tile1/);
  assert.match(browser, /data-square-sync-slot/);
  assert.match(processors, /data-square-sync-slot/);
  assert.match(html, /app\.js\?v=20260912-owner-layout1/);
});

test('Square invoice controls distinguish shop receivables from bills', () => {
  assert.match(browser, /customer balances owed to your shop—not bills you owe Square/i);
  assert.match(browser, /UNPAID CUSTOMER INVOICES/);
  assert.match(browser, /DRAFTS — NOT SENT/);
  assert.match(browser, /RECENT SQUARE PAYMENTS/);
  assert.match(browser, /data-square-publish/);
  assert.match(browser, /data-square-cancel/);
  assert.match(browser, /data-square-refund/);
  assert.match(browser, /action:'sync_all'/);
});

test('financial controls are not rendered for technicians', () => {
  assert.match(app, /const financial=canViewShopFinancials\(\)/);
  assert.match(app, /const invoiceButton=financial\?`<button type="button" data-open-invoices/);
  assert.match(browser, /\['owner','manager','service_writer'\]/);
});

test('Square sync covers customers, invoices, payments, mappings, and shop scope', () => {
  for (const path of ['/v2/customers', '/v2/invoices', '/v2/payments']) assert.ok(syncFunction.includes(path));
  assert.match(syncFunction, /integration_entity_mappings/);
  assert.match(syncFunction, /payment_processor_invoices/);
  assert.match(syncFunction, /payment_transactions/);
  assert.match(syncFunction, /\.eq\("shop_id", ctx\.shopId\)/);
  assert.match(syncFunction, /requestedShopId/);
  assert.match(syncFunction, /duplicates/);
  assert.doesNotMatch(syncFunction, /return json\([^\n]*(access_token|refresh_token)/);
});

test('Square invoice lifecycle stays draft-first and supports publish, cancel, and refunds', () => {
  assert.match(invoiceFunction, /delivery_method: "SHARE_MANUALLY"/);
  assert.match(invoiceFunction, /action === "publish"/);
  assert.match(invoiceFunction, /action === "cancel"/);
  assert.match(invoiceFunction, /action === "refund"/);
  assert.match(invoiceFunction, /maximum refundable amount/i);
  assert.match(invoiceFunction, /idempotency_key/);
  assert.doesNotMatch(invoiceFunction, /\/publish[^\n]+create_draft/);
});

test('Square webhooks are authenticated, idempotent, and do not persist raw payloads', () => {
  assert.match(webhookFunction, /x-square-hmacsha256-signature/);
  assert.match(webhookFunction, /notificationUrl\}\$\{body/);
  assert.match(webhookFunction, /constantTimeEqual/);
  assert.match(webhookFunction, /event_id: eventId/);
  assert.match(webhookFunction, /code === "23505"/);
  assert.doesNotMatch(migration, /raw_(body|payload)/i);
});

test('payment records are shop-isolated and browser read-only', () => {
  assert.match(migration, /create table if not exists public\.payment_processor_invoices/);
  assert.match(migration, /create table if not exists public\.payment_transactions/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /can_manage_shop_payments\(shop_id\)/);
  assert.match(migration, /payment_processor_credentials_square_merchant_key/);
  assert.match(migration, /revoke all on public\.payment_transactions from anon/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*payment_transactions.*authenticated/i);
});

test('disconnect revokes the Square token before deleting local credentials', () => {
  const revokeAt = processorFunction.indexOf('/revoke');
  const deleteAt = processorFunction.indexOf('.delete()');
  assert.ok(revokeAt > -1 && deleteAt > revokeAt);
  assert.match(processorFunction, /Authorization: `Client \$\{appSecret\}`/);
  assert.match(processorFunction, /connection was not removed/);
});
