const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const tools = fs.readFileSync('job-workflow-tools.js', 'utf8');
const payment = fs.readFileSync('next-invoice.js', 'utf8');

test('the production shell cache-busts and loads the simple payment controller', () => {
  assert.match(html, /job-workflow-tools\.js\?v=20261010-square-payment2/);
  assert.match(tools, /next-invoice\.js\?v=20261010-square-payment2/);
  assert.match(tools, /__MMASimpleJobPaymentLoaded/);
  assert.match(tools, /document\.querySelector\('\[data-job-work-order\]'\)/);
});

test('the owner job screen has one work-order parts and labor area plus a payment summary', () => {
  assert.match(payment, /PAYMENT/);
  assert.match(payment, /Square Invoice/);
  assert.match(payment, /Uses the Parts and Labor entered in the work order above/);
  assert.doesNotMatch(payment, /group\('Parts','parts'/);
  assert.doesNotMatch(payment, /group\('Labor','labor'/);
  assert.match(payment, /Parts from work order/);
  assert.match(payment, /Labor from work order/);
  assert.match(payment, /Invoice total/);
  assert.match(payment, /data-nxe-deposit-amount/);
  assert.match(payment, /Create Square Draft/);
  assert.match(payment, /data-nxe-publish-square/);
  assert.match(payment, /Publish Payment Link/);
  assert.match(payment, /data-nxe-open-payment-link/);
  assert.match(payment, /data-nxe-copy-payment-link/);
  assert.match(payment, /data-nxe-tap-square/);
  assert.match(payment, /Take Tap Payment/);
  assert.match(payment, /pos_checkout_link/);
  assert.match(payment, /action:'publish'/);
  assert.match(payment, /Previous jobs for this customer \/ vehicle/);
  assert.doesNotMatch(payment, /jwo-payment-only/);
  assert.doesNotMatch(payment, /data-nxe-open-square/);
  assert.doesNotMatch(payment, /Direct-Hit/);
  assert.doesNotMatch(payment, /Add Time/);
  assert.doesNotMatch(payment, /Separate From Original Invoice/);
  assert.doesNotMatch(payment, /ADDITIONAL WORK ESTIMATE/);
});

test('AI second opinion is removed from the active UI and stale links return to jobs', () => {
  assert.match(tools, /\[data-route="ai-second"\],\[data-action="second-opinion"\]/);
  assert.match(tools, /route\(\)==='ai-second'\)location\.hash='#jobs'/);
});

test('manual Square deposit rules stay enforced', () => {
  assert.match(payment, /Choose the deposit amount for this job/);
  assert.match(payment, /deposit>=total/);
  assert.match(payment, /deposit_amount:deposit,balance_days_until_due:365/);
  assert.match(payment, /balance_due_on_completion:true/);
});

test('previous jobs stay scoped to the current customer or VIN and are view only', () => {
  assert.match(payment, /String\(x\.id\)!==String\(job\.id\)/);
  assert.match(payment, /x\.customerId\|\|x\.customer_id/);
  assert.match(payment, /x\.vehicle\?\.vin/);
  assert.doesNotMatch(payment, /data-nxe-history-job/);
  assert.doesNotMatch(payment, /location\.hash='#workup'/);
});

test('financial payment view remains limited to financial shop roles', () => {
  assert.match(payment, /\['owner','shop_owner','manager','service_writer'\]/);
  assert.match(tools, /\['owner','shop_owner','manager','service_writer'\]/);
});
