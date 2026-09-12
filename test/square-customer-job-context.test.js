import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const automation = await readFile(new URL('../integration-automation.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('Square payment context is restricted to shop financial roles', () => {
  assert.match(automation, /function canView\(\).*owner.*manager.*service_writer/);
});

test('Square completed payments are grouped by the matched local customer', () => {
  assert.match(automation, /payment_transactions/);
  assert.match(automation, /local_customer_id/);
  assert.match(automation, /eq\('provider','square'\)\.eq\('status','COMPLETED'\)/);
  assert.match(automation, /Square collected/);
});

test('Square invoice status is surfaced beside linked jobs without auto-completing repairs', () => {
  assert.match(automation, /invoices.*payment_processor/s);
  assert.match(automation, /processor_status/);
  assert.match(automation, /data-open-job/);
  assert.match(automation, /Square paid/);
  assert.doesNotMatch(automation, /from\('jobs'\)\.update\(\{\s*status:\s*['"]completed/i);
});

test('customer tiles remain intake-first while Square adds payment context', () => {
  assert.match(app, /data-open-customer-intake/);
  assert.match(automation, /\[data-open-customer-intake\]/);
  assert.match(automation, /mma-square-context/);
});

test('job intake modal receives Square payment status but not profitability UI', () => {
  assert.match(automation, /Square Payment/);
  assert.doesNotMatch(app, /COMPLETED JOB PROFITABILITY/);
});
