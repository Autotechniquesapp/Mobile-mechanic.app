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

/*
 * The rule changed deliberately, so this test changed with it.
 *
 * Before: technicians saw no money at all on a work order.
 * Now: the mechanic on the job enters and sees LINE money — part cost, labor
 * hours, line amounts — because they are the person who knows what the part
 * cost and how long it took, and because they must personally sign for those
 * figures. Customer-facing money (the invoice, payments, what is owed) is
 * unchanged and still owner/manager/service_writer only.
 */
test('technician work orders still hide invoice and payment totals', () => {
  assert.match(workOrder, /function canSeeFinancials\(\).*owner.*manager.*service_writer/);
  assert.match(workOrder, /canSeeFinancials\(\)\?financialMarkup/);
});

test('work order line money is open to any active mechanic on the job, not just financial roles', () => {
  assert.match(workOrder, /function canEditWorkOrderMoney\(\)/);
  assert.match(workOrder, /canEditWorkOrderMoney\(\)[\s\S]{0,200}session\?\.role!=='shop'/);
  // Must fail closed: the user has to be found AND active. An earlier version
  // tested `?.active!==false`, which passes for a user who isn't in the shop
  // at all, so a stale session for a removed employee kept its access.
  assert.match(workOrder, /const u=shop\.users\?\.find\(x=>x\.id===id\);return Boolean\(u&&u\.active!==false\)/);
  assert.doesNotMatch(workOrder, /return Boolean\(shop\.users\?\.find\([^)]*\)\?\.active!==false\)/);
  // The line money gate must NOT be the financial-roles gate.
  assert.doesNotMatch(workOrder, /canSeeFinancials\(\)&&item\.price&&/);
  assert.match(workOrder, /data-jwo-cost/);
  assert.match(workOrder, /data-jwo-hours/);
});

test('a line number is only quotable once a named user signs for it', () => {
  assert.match(workOrder, /data-jwo-attest/);
  assert.match(workOrder, /attestLine\(/);
  assert.match(workOrder, /clearAttestation\(/);
  // Editing a figure must revoke the signature that covered the old one.
  assert.match(workOrder, /clearAttestation\(p\.confirmPartCost/);
  assert.match(workOrder, /clearAttestation\(p\.confirmLaborHours/);
});
