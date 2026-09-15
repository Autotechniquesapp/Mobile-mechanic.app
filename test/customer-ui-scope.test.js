const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html','utf8');
const ui = fs.readFileSync('ui-scope-cleanup.js','utf8');

test('production shell loads the customer scope cleanup',()=>{
  assert.match(html,/ui-scope-cleanup\.js\?v=20260915-customer-scope1/);
});

test('job payment hides the global completed jobs section',()=>{
  assert.match(ui,/mma-customer-job-detail \.mma-completed-section\{display:none!important\}/);
  assert.match(ui,/document\.querySelector\('\[data-job-work-order\]'\)/);
});

test('previous job history is exact-customer scoped',()=>{
  assert.ok(ui.includes("String(row.customerId||row.customer_id||'')===customerId"));
  assert.match(ui,/Previous jobs for this customer/);
  assert.doesNotMatch(ui,/vehicle\?\.vin/);
});

test('dashboard has one consolidated pending-intakes card with share actions',()=>{
  assert.match(ui,/PENDING CUSTOMER INTAKES/);
  assert.match(ui,/data-mma-open-intakes/);
  assert.match(ui,/data-mma-share-intake/);
  assert.match(ui,/data-mma-copy-intake/);
  assert.match(ui,/\.mmp-intake-link,\[data-mma-intake-dashboard-card\]/);
});

test('quick actions move to the right rail on desktop',()=>{
  assert.match(ui,/data-mma-rail-quick/);
  assert.match(ui,/QUICK ACTIONS/);
  assert.match(ui,/@media\(min-width:900px\).*\.mmp-quick\{display:none!important\}/s);
  assert.match(ui,/data-mma-quick-route="new-intake"/);
});

test('Square sync wording is human readable',()=>{
  assert.match(ui,/Last synced:/);
  assert.match(ui,/Last sync /);
  assert.match(ui,/Updated\\s\+AT/);
});
