const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const work=fs.readFileSync('job-work-order.js','utf8');
const actions=fs.readFileSync('job-tile-actions.js','utf8');
const production=fs.readFileSync('supabase-production.js','utf8');
const html=fs.readFileSync('index.html','utf8');

test('job work order has direct quick entry for parts and labor hours',()=>{
  assert.match(work,/data-jwo-quick-form="parts"/);
  assert.match(work,/data-jwo-quick-value="parts"/);
  assert.match(work,/data-jwo-quick-form="work"/);
  assert.match(work,/data-jwo-quick-value="work"/);
  assert.match(work,/>\+ Add Part</);
  assert.match(work,/>\+ Add Labor</);
  assert.match(work,/function quickAdd\(type,form\)/);
});

test('work order lines can be removed without rebuilding the job',()=>{
  assert.match(work,/data-jwo-remove=/);
  assert.match(work,/function removeLine\(type,index\)/);
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
  assert.match(html,/job-work-order\.js\?v=20260929-fast-entry1/);
  assert.match(html,/job-tile-actions\.js\?v=20260929-tech-intake1/);
});
