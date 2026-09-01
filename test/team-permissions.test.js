import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const workOrder = await readFile(new URL('../job-work-order.js', import.meta.url), 'utf8');

test('time clock is routed and provides separate clock actions', () => {
  assert.match(app, /function timeClock\(\)/);
  assert.match(app, /'time-clock':timeClock/);
  assert.match(app, /data-action=\"clock-in\"/);
  assert.match(app, /data-action=\"clock-out\"/);
});

test('technicians cannot open financial administration routes directly', () => {
  assert.match(app, /function canViewShopFinancials\(\).*owner.*manager.*service_writer/);
  assert.match(app, /\['billing','settings','reports','export'\].*!canViewShopFinancials/);
});

test('technician work orders hide invoice totals and part prices', () => {
  assert.match(workOrder, /function canSeeFinancials\(\).*owner.*manager.*service_writer/);
  assert.match(workOrder, /canSeeFinancials\(\)&&item\.price/);
  assert.match(workOrder, /canSeeFinancials\(\)\?financialMarkup/);
});
