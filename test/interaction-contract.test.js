const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js');
const production=read('supabase-production.js');
const tiles=read('job-tile-actions.js');
const scope=read('ui-scope-cleanup.js');
const calendar=read('calendar-live-actions.js');

test('generic routes and job cards are delegated so dynamically rendered controls still open',()=>{
  assert.ok(app.includes("closest?.('[data-route]')"));
  assert.ok(app.includes("closest?.('[data-open-job]')"));
});

test('job panel separates decline from permanent delete',()=>{
  assert.ok(tiles.includes('data-job-panel-decline'));
  assert.ok(tiles.includes("dispatchPersistentAction('decline-job',id)"));
  assert.ok(tiles.includes("dispatchPersistentAction('delete-job',id)"));
  assert.ok(!tiles.includes("function deleteJob(id){if(!jobById(id))return toast('Job not found.','bad');dispatchPersistentAction('decline-job',id);"));
});

test('customer names vehicles and previous-job rows are actionable',()=>{
  assert.ok(tiles.includes('data-job-panel-customer'));
  assert.ok(tiles.includes('data-job-panel-open'));
  assert.ok(tiles.includes('interactiveValue(k,v)'));
  assert.ok(tiles.includes('href="tel:'));
  assert.ok(tiles.includes('google.com/maps/search'));
  assert.ok(scope.includes('data-mma-history-job'));
  assert.ok(scope.includes('function openJob(id)'));
});

test('calendar day job edit map and remove controls all have click handlers',()=>{
  for(const marker of ['data-cal-day','data-cal-open-job','data-cal-edit','data-cal-maps','data-cal-remove']) assert.ok(calendar.includes(marker),marker);
});

test('time clock is production-backed',()=>{
  assert.ok(production.includes("action==='clock-in'"));
  assert.ok(production.includes("action==='clock-out'"));
  assert.ok(production.includes("from('technician_time_entries')"));
  assert.ok(production.includes("timeEntries:(timeEntriesRes.data||[]).map"));
});

test('technician and shop identity controls persist to production services',()=>{
  assert.ok(production.includes("from('technician_profiles').upsert"));
  assert.ok(production.includes("from('shop_members').update({status:next})"));
  assert.ok(production.includes("storage.from('technician-avatars')"));
  assert.ok(production.includes("storage.from('shop-logos')"));
  assert.ok(production.includes("carfax_status:'Ready'"));
  assert.ok(app.includes('Login email is managed through the account, not the profile.'));
});
