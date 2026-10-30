const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const work=fs.readFileSync('job-work-order.js','utf8');
const invoice=fs.readFileSync('next-invoice.js','utf8');
const actions=fs.readFileSync('job-tile-actions.js','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('invoice has direct editable parts and labor with no billing checklist',()=>{
  for(const field of ['data-nxe-name','data-nxe-add','data-nxe-quantity','data-nxe-unit-price','data-nxe-hours','data-nxe-rate','data-nxe-flat-amount'])assert.ok(invoice.includes(field));
  const visible=work.slice(work.indexOf('function markup(state){'),work.indexOf('function css(){'));
  assert.doesNotMatch(visible,/data-jwo-quick-form|data-jwo-attest|data-jwo-section|data-jwo-totals/);
});

test('invoice lines can be removed without rebuilding the job',()=>{
  assert.match(invoice,/data-nxe-remove/);
  assert.match(invoice,/\.splice\(Number\(r\.dataset\.nxeIndex\),1\)/);
});

test('owners and managers get a permanent delete job action on the work order',()=>{
  assert.match(work,/function canDeleteJob\(\)/);
  assert.match(work,/data-action="delete-job"/);
  assert.match(production,/if\(action==='delete-job'\)/);
  assert.match(production,/from\('jobs'\)\.delete\(\)/);
});

test('job popup separates declined from permanent delete',()=>{
  assert.match(actions,/data-job-panel-decline=/);
  assert.match(actions,/data-job-panel-delete=/);
  assert.match(actions,/dispatchPersistentAction\('decline-job',id\)/);
  assert.match(actions,/dispatchPersistentAction\('delete-job',id\)/);
  assert.doesNotMatch(actions,/Delete \/ Customer Declined/);
});

test('technician intake uses compact summary and no automatic location takeover',()=>{
  assert.match(actions,/function compactIntake\(j\)/);
  assert.match(actions,/Customer says/);
  assert.match(actions,/More intake details/);
  assert.doesNotMatch(html,/intake-location-enhancement\.js/);
  assert.match(html,/job-work-order\.js\?v=20261030-clean-invoice2/);
  assert.match(html,/job-tile-actions\.js\?v=20260929-tech-intake1/);
});
