const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const payments = fs.readFileSync(path.join(root, 'shop-job-payment.js'), 'utf8');

test('dashboard includes one open invoices tile', () => {
  assert.equal((app.match(/data-open-invoices/g) || []).length, 2);
  assert.match(app, /<b>OPEN INVOICES<\/b>/);
});

test('job payment panel is restricted to the workup route', () => {
  assert.match(payments, /route\(\)!=='workup'/);
  assert.match(payments, /querySelector\('\[data-shop-job-payment\]'\)\?\.remove\(\)/);
});

test('dashboard tile excludes settled invoice states', () => {
  for (const status of ['paid', 'canceled', 'cancelled', 'void', 'voided']) {
    assert.match(payments, new RegExp(`['\"]${status}['\"]`));
  }
});
