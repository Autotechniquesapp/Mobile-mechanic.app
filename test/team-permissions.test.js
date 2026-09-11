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

test('technician work orders still hide invoice and payment totals', () => {
  assert.match(workOrder, /function canSeeFinancials\(\).*owner.*manager.*service_writer/);
  assert.match(workOrder, /canSeeFinancials\(\)\?financialMarkup/);
});

test('work order money is limited to financial roles or the sole active technician', () => {
  assert.match(workOrder, /function canEditWorkOrderMoney\(\)/);
  assert.match(workOrder, /canEditWorkOrderMoney\(\)[\s\S]{0,200}session\?\.role!=='shop'/);
  assert.match(workOrder, /\['owner','manager','service_writer'\]\.includes\(u\.role\)/);
  assert.match(workOrder, /u\.role==='technician'&&activeUsers\.length===1&&activeUsers\[0\]\.id===id/);
  assert.match(workOrder, /if\(!u\|\|u\.active===false\)return false/);
  assert.match(workOrder, /setMoney\([\s\S]{0,160}!canEditWorkOrderMoney\(\)/);
  assert.match(workOrder, /openAttestModal\([\s\S]{0,160}!canEditWorkOrderMoney\(\)/);
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
